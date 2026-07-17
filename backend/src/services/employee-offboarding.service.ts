/**
 * Transition ACTIF↔INACTIF d'un employé — logique partagée entre le contrôleur
 * (PUT /api/employees/:id) et le script d'import Agendrix, pour que les
 * désactivations en lot déclenchent EXACTEMENT le même offboarding uniformes
 * que l'UI (ancres de fin d'emploi, propagation des échéances, avertissement).
 */
import { prisma } from '../config/database';
import { addBusinessDays } from '../utils/business-days';
import { UNIFORM_RETURN_DEADLINE_BUSINESS_DAYS } from '../constants/uniform';
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
 * Ancres de la transition ACTIF→INACTIF : fin d'emploi + échéance de retour
 * (+5 jours ouvrables). Préserve les valeurs déjà posées (ex : réenregistrement).
 */
export function buildDeactivationFields(
  existing: { terminationDate: Date | null; uniformReturnDeadlineAt: Date | null },
  now: Date = new Date()
): DeactivationFields {
  return {
    terminationDate: existing.terminationDate ?? now,
    uniformReturnDeadlineAt:
      existing.uniformReturnDeadlineAt ??
      addBusinessDays(now, UNIFORM_RETURN_DEADLINE_BUSINESS_DAYS),
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
 */
export async function propagateUniformOffboarding(
  employeeId: string,
  deadline: Date
): Promise<UniformOffboardingWarning | undefined> {
  const active = await getActiveIssuancesForEmployee(employeeId);
  const missingDue = active.filter((a) => !a.dueReturnAt).map((a) => a.id);
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
