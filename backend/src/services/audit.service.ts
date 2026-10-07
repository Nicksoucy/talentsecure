/**
 * Registre des actions (audit_logs) pour le dossier employé : qui a désactivé,
 * réactivé, fermé le dossier, enregistré un retour d'uniformes, et quand.
 *
 * `resourceId` = id de l'EMPLOYÉ pour toutes ces entrées (même celles qui
 * portent sur un uniforme) → l'historique de la fiche se lit en une requête.
 * `userId` null = action du système (clôture automatique, import sans auteur).
 *
 * Jamais bloquant : un échec d'écriture du registre ne doit pas annuler une
 * désactivation ou un retour déjà enregistrés.
 */
import { AuditAction } from '@prisma/client';
import { prisma } from '../config/database';

export const SYSTEM_ACTOR_NAME = 'Système';

export interface EmployeeAuditEntry {
  employeeId: string;
  userId?: string | null;
  action?: AuditAction;
  resource?: 'Employee' | 'Uniform';
  details: string;
}

export async function recordEmployeeAudit(entry: EmployeeAuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action ?? 'UPDATE',
        resource: entry.resource ?? 'Employee',
        resourceId: entry.employeeId,
        details: entry.details,
      },
    });
  } catch (e) {
    console.error('Registre (audit) non écrit:', (e as Error).message);
  }
}

export interface EmployeeHistoryEntry {
  id: string;
  createdAt: Date;
  action: AuditAction;
  resource: string;
  details: string | null;
  by: string;
}

/** Historique du dossier, plus récent d'abord. */
export async function getEmployeeHistory(employeeId: string): Promise<EmployeeHistoryEntry[]> {
  const logs = await prisma.auditLog.findMany({
    where: { resourceId: employeeId, action: { not: 'READ' } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      createdAt: true,
      action: true,
      resource: true,
      details: true,
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  return logs.map(({ user, ...l }) => ({
    ...l,
    by: user
      ? [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email
      : SYSTEM_ACTOR_NAME,
  }));
}
