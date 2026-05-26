/**
 * Logique de stock auditable du module Uniformes.
 *
 * Règle d'or : toute mutation de `quantityOnHand` passe par `applyMovement`
 * DANS une transaction Prisma, qui écrit aussi le mouvement correspondant dans
 * `uniform_stock_movements` (la source de vérité). On stocke le delta SIGNÉ :
 *   IN/ADJUST(+) → positif ; OUT/LOST/DAMAGED → négatif ; ADJUST peut être négatif.
 * Ainsi quantityOnHand == somme des deltas (réconciliable).
 */
import { Prisma, UniformMovementType } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';

type Tx = Prisma.TransactionClient;

export interface MovementInput {
  variantId: string;
  type: UniformMovementType;
  /** Magnitude pour IN/OUT/LOST/DAMAGED ; delta signé pour ADJUST. */
  quantity: number;
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
      return quantity; // signé tel quel
    case 'WASH_OUT_DAMAGED':
    case 'DISPOSAL':
      return 0; // déjà sorti du stock (WASH_IN ou OUT précédent), événement audit
    default:
      return 0;
  }
}

/**
 * Applique un mouvement de stock + met à jour le cache quantityOnHand, le tout
 * dans la transaction fournie. Rejette si le stock deviendrait négatif.
 */
export async function applyMovement(tx: Tx, input: MovementInput) {
  const delta = signedDelta(input.type, input.quantity);

  const variant = await tx.uniformVariant.findUnique({ where: { id: input.variantId } });
  if (!variant) throw new ApiError(404, 'Variante introuvable');

  const newQty = variant.quantityOnHand + delta;
  if (newQty < 0) {
    throw new ApiError(400, `Stock insuffisant pour la variante ${input.variantId} (disponible: ${variant.quantityOnHand})`);
  }

  await tx.uniformVariant.update({
    where: { id: input.variantId },
    data: { quantityOnHand: newQty },
  });

  return tx.uniformStockMovement.create({
    data: {
      variantId: input.variantId,
      type: input.type,
      quantity: delta,
      reason: input.reason ?? null,
      issuanceId: input.issuanceId ?? null,
      returnId: input.returnId ?? null,
      createdById: input.createdById ?? null,
    },
  });
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
}> {
  const variant = await prisma.uniformVariant.findUnique({ where: { id: variantId } });
  if (!variant) throw new ApiError(404, 'Variante introuvable');

  const agg = await prisma.uniformStockMovement.aggregate({
    where: { variantId },
    _sum: { quantity: true },
  });
  const computedFromLedger = Number(agg._sum.quantity ?? 0);
  return {
    cache: variant.quantityOnHand,
    computedFromLedger,
    drift: variant.quantityOnHand - computedFromLedger,
  };
}
