/**
 * Logique de stock auditable du module Uniformes.
 *
 * Règle d'or : toute mutation de `quantityOnHand` passe par `applyMovement`
 * DANS une transaction Prisma, qui écrit aussi le mouvement correspondant dans
 * `uniform_stock_movements` (la source de vérité). On stocke le delta SIGNÉ :
 *   IN/ADJUST(+) → positif ; OUT/LOST/DAMAGED → négatif ; ADJUST peut être négatif.
 * Ainsi quantityOnHand == somme des deltas (réconciliable).
 */
import { Prisma, UniformMovementType, UniformStockLocation } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';

type Tx = Prisma.TransactionClient;

export interface MovementInput {
  variantId: string;
  type: UniformMovementType;
  /** Magnitude pour IN/OUT/LOST/DAMAGED ; delta signé pour ADJUST/TRANSFER. */
  quantity: number;
  /** Emplacement physique affecté par ce mouvement. */
  location: UniformStockLocation;
  reason?: string | null;
  issuanceId?: string | null;
  returnId?: string | null;
  createdById?: string | null;
}

/** Calcule le delta signé sur le stock selon le type de mouvement.
 *
 * V2 — Cycle de lavage :
 *   - WASH_IN : pièce sort du stock disponible vers un lot de lavage (delta -)
 *   - WASH_OUT_GOOD : pièce revient du lot vers le stock (delta +)
 *   - WASH_OUT_DAMAGED : pièce du lot vers la poubelle — déjà comptée comme sortie
 *     via WASH_IN, donc delta=0 (audit pur)
 *   - DISPOSAL : sortie définitive explicite (delta 0, audit)
 */
function signedDelta(type: UniformMovementType, quantity: number): number {
  switch (type) {
    case 'IN':
    case 'WASH_OUT_GOOD':
      return Math.abs(quantity);
    case 'OUT':
    case 'LOST':
    case 'DAMAGED':
    case 'WASH_IN':
      return -Math.abs(quantity);
    case 'ADJUST':
    case 'TRANSFER':
      return quantity; // signé tel quel (TRANSFER : - à la source, + à la destination)
    case 'WASH_OUT_DAMAGED':
    case 'DISPOSAL':
      return 0; // déjà sorti du stock (WASH_IN ou OUT précédent), événement audit
    default:
      return 0;
  }
}

/**
 * Applique un mouvement de stock à un EMPLACEMENT donné + met à jour le bucket
 * de cet emplacement ET le cache du TOTAL (UniformVariant.quantityOnHand), le
 * tout dans la transaction fournie. La borne « stock non négatif » s'applique
 * désormais à l'emplacement (le bucket le plus contraignant) : on ne peut pas
 * sortir plus que ce qu'il y a à cet emplacement précis.
 */
export async function applyMovement(tx: Tx, input: MovementInput) {
  const delta = signedDelta(input.type, input.quantity);

  const variant = await tx.uniformVariant.findUnique({ where: { id: input.variantId } });
  if (!variant) throw new ApiError(404, 'Variante introuvable');

  // Bucket de l'emplacement (créé à la volée s'il n'existe pas encore).
  const bucket = await tx.uniformVariantStock.findUnique({
    where: { variantId_location: { variantId: input.variantId, location: input.location } },
  });
  const currentLocQty = bucket?.quantityOnHand ?? 0;
  const newLocQty = currentLocQty + delta;
  if (newLocQty < 0) {
    throw new ApiError(
      400,
      `Stock insuffisant pour la variante ${input.variantId} à l'emplacement ${input.location} (disponible: ${currentLocQty})`,
    );
  }

  const newTotal = variant.quantityOnHand + delta;
  if (newTotal < 0) {
    throw new ApiError(400, `Stock total insuffisant pour la variante ${input.variantId} (disponible: ${variant.quantityOnHand})`);
  }

  await tx.uniformVariantStock.upsert({
    where: { variantId_location: { variantId: input.variantId, location: input.location } },
    create: { variantId: input.variantId, location: input.location, quantityOnHand: newLocQty },
    update: { quantityOnHand: newLocQty },
  });

  await tx.uniformVariant.update({
    where: { id: input.variantId },
    data: { quantityOnHand: newTotal },
  });

  return tx.uniformStockMovement.create({
    data: {
      variantId: input.variantId,
      type: input.type,
      quantity: delta,
      location: input.location,
      reason: input.reason ?? null,
      issuanceId: input.issuanceId ?? null,
      returnId: input.returnId ?? null,
      createdById: input.createdById ?? null,
    },
  });
}

/**
 * Transfert d'une variante d'un emplacement à un autre : deux mouvements
 * TRANSFER (− à la source, + à la destination) qui s'annulent sur le TOTAL.
 * « Mêmes quantités, juste déplacées » : le cache total reste inchangé tandis
 * que les buckets bougent. La garde par emplacement empêche de sur-transférer.
 */
export async function transferStock(
  tx: Tx,
  params: {
    variantId: string;
    quantity: number;
    from: UniformStockLocation;
    to: UniformStockLocation;
    reason?: string | null;
    createdById?: string | null;
  },
) {
  const qty = Math.abs(params.quantity);
  if (qty <= 0) throw new ApiError(400, 'Quantité de transfert invalide');
  if (params.from === params.to) throw new ApiError(400, 'Emplacements source et destination identiques');

  const reason = params.reason ?? `Transfert ${params.from} → ${params.to}`;

  const out = await applyMovement(tx, {
    variantId: params.variantId,
    type: 'TRANSFER',
    quantity: -qty, // sortie de la source
    location: params.from,
    reason,
    createdById: params.createdById ?? null,
  });

  const into = await applyMovement(tx, {
    variantId: params.variantId,
    type: 'TRANSFER',
    quantity: qty, // entrée à la destination
    location: params.to,
    reason,
    createdById: params.createdById ?? null,
  });

  return { out, into };
}

export interface Holding {
  variantId: string;
  itemId: string;
  itemName: string;
  division: string;
  type: string;
  size: string;
  barcode: string;
  replacementCost: number;
  quantity: number;
}

/**
 * Détentions actuelles d'un agent = Σ(lignes de prêts non-brouillon/non-annulés)
 * − Σ(lignes de retours finalisés), par variante (> 0).
 */
export async function computeHoldings(employeeId: string): Promise<Holding[]> {
  const issuances = await prisma.uniformIssuance.findMany({
    where: { employeeId, status: { notIn: ['DRAFT', 'CANCELLED'] } },
    include: { lines: { include: { variant: { include: { item: true } } } } },
  });
  const returns = await prisma.uniformReturn.findMany({
    where: { employeeId, status: 'RETURNED' },
    include: { lines: true },
  });

  const map = new Map<string, Holding>();

  for (const iss of issuances) {
    for (const line of iss.lines) {
      if (!line.variantId || !line.variant) continue; // ignore lignes "Autre"
      const v = line.variant;
      const existing = map.get(line.variantId);
      if (existing) {
        existing.quantity += line.quantity;
      } else {
        map.set(line.variantId, {
          variantId: v.id,
          itemId: v.itemId,
          itemName: v.item.name,
          division: v.item.division,
          type: v.item.type,
          size: v.size,
          barcode: v.barcode,
          replacementCost: Number(v.replacementCost),
          quantity: line.quantity,
        });
      }
    }
  }

  for (const ret of returns) {
    for (const line of ret.lines) {
      if (!line.variantId) continue;
      const existing = map.get(line.variantId);
      if (existing) existing.quantity -= line.quantity;
    }
  }

  return Array.from(map.values()).filter((h) => h.quantity > 0);
}

/**
 * Montant dû par l'agent = Σ(qty × coût snapshot) des lignes de retour
 * DAMAGED/LOST/NOT_RETURNED − Σ(règlements). Jamais < 0.
 */
export async function computeAmountOwed(employeeId: string): Promise<{
  charged: number;
  settled: number;
  owed: number;
}> {
  const returns = await prisma.uniformReturn.findMany({
    where: { employeeId, status: 'RETURNED' },
    include: { lines: true },
  });

  let charged = 0;
  for (const ret of returns) {
    for (const line of ret.lines) {
      if (line.condition === 'DAMAGED' || line.condition === 'LOST' || line.condition === 'NOT_RETURNED') {
        charged += line.quantity * Number(line.unitReplacementCost);
      }
    }
  }

  const settlementsAgg = await prisma.uniformDebtSettlement.aggregate({
    where: { employeeId },
    _sum: { amount: true },
  });
  const settled = Number(settlementsAgg._sum.amount ?? 0);

  return { charged, settled, owed: Math.max(0, charged - settled) };
}

/**
 * V2 — Calcule, par variante, le nombre de pièces actuellement dans un cycle
 * de lavage = Σ(WASH_IN absolu) − Σ(WASH_OUT_GOOD + WASH_OUT_DAMAGED absolus).
 * Si `variantId` est fourni, ne retourne que cette clé ; sinon toutes.
 */
export async function computeInWashing(
  variantId?: string,
): Promise<Map<string, number>> {
  const where: any = { type: { in: ['WASH_IN', 'WASH_OUT_GOOD', 'WASH_OUT_DAMAGED'] } };
  if (variantId) where.variantId = variantId;

  const grouped = await prisma.uniformStockMovement.groupBy({
    by: ['variantId', 'type'],
    where,
    _sum: { quantity: true },
  });

  const map = new Map<string, number>();
  for (const g of grouped) {
    const sum = Math.abs(Number(g._sum.quantity ?? 0));
    const cur = map.get(g.variantId) ?? 0;
    if (g.type === 'WASH_IN') {
      map.set(g.variantId, cur + sum);
    } else {
      // WASH_OUT_GOOD ou WASH_OUT_DAMAGED → sortie du lavage
      map.set(g.variantId, cur - sum);
    }
  }
  // Filtre les variants avec 0 (rien en lavage actuellement)
  for (const [k, v] of map) if (v <= 0) map.delete(k);
  return map;
}

/**
 * V2 — Audit : compare le cache quantityOnHand avec Σ des mouvements.
 * Retourne { cache, computedFromLedger, drift } pour détecter les divergences
 * (devrait toujours être 0 si on n'a jamais bypassé applyMovement).
 */
export async function auditVariantStock(variantId: string): Promise<{
  cache: number;
  computedFromLedger: number;
  drift: number;
  byLocation: Array<{
    location: UniformStockLocation;
    cache: number;
    computedFromLedger: number;
    drift: number;
  }>;
}> {
  const variant = await prisma.uniformVariant.findUnique({
    where: { id: variantId },
    include: { stockByLocation: true },
  });
  if (!variant) throw new ApiError(404, 'Variante introuvable');

  const agg = await prisma.uniformStockMovement.aggregate({
    where: { variantId },
    _sum: { quantity: true },
  });
  const computedFromLedger = Number(agg._sum.quantity ?? 0);

  // Réconciliation par emplacement : on-hand(loc) == Σ mouvements(loc).
  const perLoc = await prisma.uniformStockMovement.groupBy({
    by: ['location'],
    where: { variantId },
    _sum: { quantity: true },
  });
  const ledgerByLoc = new Map<UniformStockLocation, number>();
  for (const g of perLoc) ledgerByLoc.set(g.location, Number(g._sum.quantity ?? 0));

  const cacheByLoc = new Map<UniformStockLocation, number>();
  for (const s of variant.stockByLocation) cacheByLoc.set(s.location, s.quantityOnHand);

  const locations = new Set<UniformStockLocation>([
    ...ledgerByLoc.keys(),
    ...cacheByLoc.keys(),
  ]);
  const byLocation = Array.from(locations).map((location) => {
    const cache = cacheByLoc.get(location) ?? 0;
    const led = ledgerByLoc.get(location) ?? 0;
    return { location, cache, computedFromLedger: led, drift: cache - led };
  });

  return {
    cache: variant.quantityOnHand,
    computedFromLedger,
    drift: variant.quantityOnHand - computedFromLedger,
    byLocation,
  };
}

// ===========================================================================
// Offboarding — uniformes détenus par les anciens employés (status INACTIF).
// ===========================================================================

/**
 * Remises actives (non clôturées) d'un employé = celles encore susceptibles de
 * porter des pièces à récupérer (ISSUED ou PARTIALLY_RETURNED). Utilisé par la
 * transition de fin d'emploi (propagation d'échéance) et la clôture en masse.
 */
export async function getActiveIssuancesForEmployee(
  employeeId: string,
): Promise<Array<{ id: string; dueReturnAt: Date | null }>> {
  return prisma.uniformIssuance.findMany({
    where: { employeeId, status: { in: ['ISSUED', 'PARTIALLY_RETURNED'] } },
    select: { id: true, dueReturnAt: true },
  });
}

export interface InactiveHolder {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    terminationDate: Date | null;
    uniformReturnDeadlineAt: Date | null;
  };
  holdings: Holding[];
  totalPieces: number;
  owed: number;
  charged: number;
  settled: number;
  activeIssuanceIds: string[];
}

/**
 * Liste les anciens employés (INACTIF, non supprimés) qui détiennent ENCORE des
 * uniformes (Σ remises non-brouillon − Σ retours finalisés > 0). C'est le signal
 * propre pour cibler les régularisations : après une clôture de fin d'emploi,
 * `computeHoldings` retombe à 0 et l'employé disparaît de cette liste.
 */
export async function listOutstandingByInactiveEmployees(): Promise<InactiveHolder[]> {
  const employees = await prisma.employee.findMany({
    where: { status: 'INACTIF', isDeleted: false },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      terminationDate: true,
      uniformReturnDeadlineAt: true,
    },
    orderBy: [{ uniformReturnDeadlineAt: 'asc' }, { lastName: 'asc' }],
  });

  const out: InactiveHolder[] = [];
  for (const emp of employees) {
    const holdings = await computeHoldings(emp.id);
    if (holdings.length === 0) continue;
    const owed = await computeAmountOwed(emp.id);
    const active = await getActiveIssuancesForEmployee(emp.id);
    out.push({
      employee: emp,
      holdings,
      totalPieces: holdings.reduce((s, h) => s + h.quantity, 0),
      owed: owed.owed,
      charged: owed.charged,
      settled: owed.settled,
      activeIssuanceIds: active.map((a) => a.id),
    });
  }
  return out;
}
