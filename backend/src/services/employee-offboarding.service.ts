/**
 * Transition ACTIF↔INACTIF d'un employé — logique partagée entre le contrôleur
 * (PUT /api/employees/:id) et le script d'import Agendrix, pour que les
 * désactivations en lot déclenchent EXACTEMENT le même offboarding uniformes
 * que l'UI (ancres de fin d'emploi, propagation des échéances, avertissement).
 */
import { prisma } from '../config/database';
import { UNIFORM_RETURN_DEADLINE_CALENDAR_DAYS } from '../constants/uniform';
import { addDaysYmd, endOfDayMontreal, montrealYmd } from '../utils/montreal-date';
import {
  computeAmountOwed,
  computeHoldings,
  getActiveIssuancesForEmployee,
} from './uniform-stock.service';

export interface DeactivationFields {
  terminationDate: Date;
  uniformReturnDeadlineAt: Date;
}

/**
 * Échéance de retour par défaut : +14 jours de calendrier, fin de journée à
 * Montréal (« au plus tard le 14 octobre » = tout le 14 octobre compte).
 */
export function defaultReturnDeadline(now: Date = new Date()): Date {
  return endOfDayMontreal(addDaysYmd(montrealYmd(now), UNIFORM_RETURN_DEADLINE_CALENDAR_DAYS));
}

/**
 * Ancres de la transition ACTIF→INACTIF : fin d'emploi + échéance de retour
 * (+14 jours). Préserve les valeurs déjà posées (ex : réenregistrement), sauf si
 * RH choisit explicitement une date (`deadlineOverride`, « Fermer le dossier »).
 */
export function buildDeactivationFields(
  existing: { terminationDate: Date | null; uniformReturnDeadlineAt: Date | null },
  now: Date = new Date(),
  deadlineOverride?: Date
): DeactivationFields {
  return {
    terminationDate: existing.terminationDate ?? now,
    uniformReturnDeadlineAt:
      deadlineOverride ?? existing.uniformReturnDeadlineAt ?? defaultReturnDeadline(now),
  };
}

export interface UniformOffboardingWarning {
  totalPieces: number;
  owed: number;
  holdings: Awaited<ReturnType<typeof computeHoldings>>;
  activeIssuanceIds: string[];
  deadline: string | null;
}

/**
 * À la fin d'emploi : propage l'échéance aux remises actives SANS date butoir
 * (ferme l'angle mort des remises invisibles à la surveillance des retards) et
 * renvoie un avertissement non bloquant si l'employé détient encore des pièces.
 *
 * `previousDeadline` : ancienne échéance de l'employé quand RH en choisit une
 * nouvelle — les remises qui l'avaient reçue par propagation suivent aussi.
 */
export async function propagateUniformOffboarding(
  employeeId: string,
  deadline: Date,
  previousDeadline?: Date | null
): Promise<UniformOffboardingWarning | undefined> {
  const active = await getActiveIssuancesForEmployee(employeeId);
  const missingDue = active
    .filter(
      (a) =>
        !a.dueReturnAt ||
        (previousDeadline && a.dueReturnAt.getTime() === previousDeadline.getTime())
    )
    .map((a) => a.id);
  if (missingDue.length > 0) {
    await prisma.uniformIssuance.updateMany({
      where: { id: { in: missingDue } },
      data: { dueReturnAt: deadline },
    });
  }

  const holdings = await computeHoldings(employeeId);
  if (holdings.length === 0) return undefined;

  const owed = await computeAmountOwed(employeeId);
  return {
    totalPieces: holdings.reduce((s, h) => s + h.quantity, 0),
    owed: owed.owed,
    holdings,
    activeIssuanceIds: active.map((a) => a.id),
    deadline: deadline.toISOString(),
  };
}

/**
 * Réembauche : annule UNIQUEMENT les échéances que la fin d'emploi avait
 * propagées (dueReturnAt == ancienne échéance de retour), pour ne pas laisser
 * les anciens prêts déclencher des alertes de retard sur un employé réactivé.
 * Les dates butoir fixées manuellement (valeur différente) sont préservées.
 */
export async function revertUniformOffboarding(
  employeeId: string,
  previousDeadline: Date
): Promise<void> {
  await prisma.uniformIssuance.updateMany({
    where: {
      employeeId,
      status: { in: ['ISSUED', 'PARTIALLY_RETURNED'] },
      dueReturnAt: previousDeadline,
    },
    data: { dueReturnAt: null },
  });
}

export interface EstimatedPiece {
  itemName: string;
  size: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface HoldingsEstimate {
  pieces: EstimatedPiece[];
  totalPieces: number;
  total: number;
  /** Remises actives SANS aucune ligne (import PDF historique) : montant incomplet. */
  issuancesWithoutLines: number;
}

/**
 * Montant qui sera retenu si rien ne revient : pièces détenues × coût figé sur
 * la remise (`unitCostSnapshot`, la même base que `closeTerminationCore`), pour
 * que le montant annoncé à l'employé soit celui que la paie recevra. Repli sur
 * le coût courant de la variante si aucune remise active ne la porte.
 */
export async function estimateHoldingsCost(employeeId: string): Promise<HoldingsEstimate> {
  const [holdings, active] = await Promise.all([
    computeHoldings(employeeId),
    prisma.uniformIssuance.findMany({
      where: { employeeId, status: { in: ['ISSUED', 'PARTIALLY_RETURNED'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, lines: { select: { variantId: true, unitCostSnapshot: true } } },
    }),
  ]);

  const snapshot = new Map<string, number>();
  for (const iss of active) {
    for (const l of iss.lines) {
      if (l.variantId && !snapshot.has(l.variantId)) snapshot.set(l.variantId, Number(l.unitCostSnapshot));
    }
  }

  const pieces = holdings.map((h) => {
    const unitCost = snapshot.get(h.variantId) ?? h.replacementCost;
    return {
      itemName: h.itemName,
      size: h.size,
      quantity: h.quantity,
      unitCost,
      lineTotal: Math.round(unitCost * h.quantity * 100) / 100,
    };
  });

  return {
    pieces,
    totalPieces: pieces.reduce((s, p) => s + p.quantity, 0),
    total: Math.round(pieces.reduce((s, p) => s + p.lineTotal, 0) * 100) / 100,
    issuancesWithoutLines: active.filter((a) => a.lines.length === 0).length,
  };
}
