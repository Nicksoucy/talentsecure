/**
 * Clôture de fin d'emploi d'une remise d'uniforme — logique partagée entre :
 *   - le controller (`POST /issuances/:id/close-termination`, action manuelle RH),
 *   - le job de surveillance (clôture AUTOMATIQUE après le délai de grâce).
 *
 * Marque les pièces encore détenues comme NOT_RETURNED (dette figée pour
 * prélèvement sur la dernière paie), passe la remise en CLOSED_TERMINATION,
 * annule les rappels (DUE_SOON + OVERDUE) encore en file. La notification RH/PAIE
 * de la dette est émise SÉPARÉMENT, une seule fois par employé (cf.
 * `notifyTerminationClosed`), pour éviter des courriels en double aux montants
 * croissants quand un employé a plusieurs remises clôturées dans la même passe.
 *
 * Idempotent : ne fait rien si la remise n'est pas dans un état clôturable
 * (ISSUED / PARTIALLY_RETURNED) — renvoie alors null.
 *
 * Anti-surfacturation : les quantités NOT_RETURNED sont plafonnées par les
 * détentions GLOBALES de l'employé pour chaque variante (`computeHoldings`).
 * Sans ce plafond, un retour enregistré sur une remise sœur ferait facturer
 * deux fois la même pièce (le calcul `remaining` est par-remise alors que les
 * détentions se nettent globalement). Après clôture, `computeHoldings` retombe
 * à 0 → une 2ᵉ passe est un no-op.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { notify } from './notification.service';
import { EMAIL_RH } from './email.service';
import { computeAmountOwed, computeHoldings } from './uniform-stock.service';

export type ClosableIssuance = Prisma.UniformIssuanceGetPayload<{
  include: {
    lines: { include: { variant: true } };
    returns: { include: { lines: true } };
  };
}>;

const DEFAULT_REASON = 'Clôture fin d’emploi — pièces non retournées';

/**
 * Cœur transactionnel de la clôture, à partir d'une remise DÉJÀ chargée (avec
 * lignes + retours). Le controller valide l'état (404/400) avant d'appeler ;
 * le job filtre les remises clôturables avant d'appeler. N'émet PAS la notif de
 * dette — l'appelant le fait via `notifyTerminationClosed` (une fois par employé).
 *
 * @returns l'id du retour créé + l'employeeId, ou null si non clôturable.
 */
export async function closeTerminationCore(
  issuance: ClosableIssuance,
  createdById: string | null,
  reason: string = DEFAULT_REASON,
): Promise<{ returnId: string; employeeId: string } | null> {
  if (!['ISSUED', 'PARTIALLY_RETURNED'].includes(issuance.status)) return null;

  // Quantité restante par variante = Σ(lignes) − Σ(retours déjà finalisés).
  const remaining = new Map<string, { quantity: number; cost: number }>();
  for (const line of issuance.lines) {
    if (!line.variantId) continue;
    const cur = remaining.get(line.variantId) || { quantity: 0, cost: Number(line.unitCostSnapshot) };
    cur.quantity += line.quantity;
    remaining.set(line.variantId, cur);
  }
  for (const ret of issuance.returns) {
    if (ret.status !== 'RETURNED') continue;
    for (const rl of ret.lines) {
      if (!rl.variantId) continue;
      const cur = remaining.get(rl.variantId);
      if (cur) cur.quantity -= rl.quantity;
    }
  }

  // Plafonne par les détentions GLOBALES de l'employé (anti-surfacturation).
  const holdings = await computeHoldings(issuance.employeeId);
  const heldByVariant = new Map(holdings.map((h) => [h.variantId, h.quantity]));

  const lines = [...remaining.entries()]
    .map(([variantId, v]) => ({
      variantId,
      quantity: Math.min(v.quantity, heldByVariant.get(variantId) ?? 0),
      cost: v.cost,
    }))
    .filter((x) => x.quantity > 0)
    .map((x) => ({
      variantId: x.variantId,
      quantity: x.quantity,
      condition: 'NOT_RETURNED' as const,
      unitReplacementCost: x.cost,
    }));

  const created = await prisma.$transaction(async (tx) => {
    const ret = await tx.uniformReturn.create({
      data: {
        issuanceId: issuance.id,
        employeeId: issuance.employeeId,
        status: 'RETURNED',
        returnedAt: new Date(),
        notes: reason,
        createdById,
        lines: { create: lines },
      },
    });
    await tx.uniformIssuance.update({
      where: { id: issuance.id },
      data: { status: 'CLOSED_TERMINATION' },
    });
    // Annule les rappels encore en attente (DUE_SOON + OVERDUE) pour cette remise
    // — évite des alertes « non retourné » contradictoires après clôture.
    await tx.notification.updateMany({
      where: {
        status: 'PENDING',
        OR: [
          { dedupKey: { startsWith: `due-soon-${issuance.id}::` } },
          { dedupKey: { startsWith: `overdue-${issuance.id}::` } },
          { dedupKey: { startsWith: `overdue-paie-${issuance.id}::` } },
        ],
      },
      data: { status: 'FAILED', failedReason: 'Issuance clôturée (terminaison)' },
    });
    return ret;
  });

  return { returnId: created.id, employeeId: issuance.employeeId };
}

/** Base des liens dans les courriels (jamais localhost chez la paie). */
export function appBaseUrl(): string {
  const url = process.env.FRONTEND_URL?.trim();
  if (url && !/localhost|127\.0\.0\.1/.test(url)) return url.replace(/\/$/, '');
  return 'https://talentsecure-frontend-572017163659.northamerica-northeast1.run.app';
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const money = (n: number) => `${n.toFixed(2).replace('.', ',')} $`;

/** Courriel à la paie : pièces non retournées + montant à retenir. */
export function buildPayrollDeductionHtml(opts: {
  employeeName: string;
  employeeNumber?: string | null;
  deadline: Date | null;
  lines: Array<{ itemName: string; size: string; quantity: number; lineTotal: number }>;
  amountOwed: number;
  link: string;
}): string {
  const rows = opts.lines
    .map(
      (l) => `<tr><td style="padding:6px 8px;border:1px solid #d1d5db;">${esc(l.itemName)}</td>
      <td style="padding:6px 8px;border:1px solid #d1d5db;">${esc(l.size)}</td>
      <td style="padding:6px 8px;border:1px solid #d1d5db;text-align:right;">${l.quantity}</td>
      <td style="padding:6px 8px;border:1px solid #d1d5db;text-align:right;">${money(l.lineTotal)}</td></tr>`
    )
    .join('');
  const deadline = opts.deadline
    ? new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', day: 'numeric', month: 'long', year: 'numeric' }).format(opts.deadline)
    : null;
  return `<div style="font-family:Arial,sans-serif;color:#111827;max-width:640px;margin:0 auto;padding:20px;">
  <h2 style="color:#b45309;margin-top:0;">Retenue sur la paie — uniformes non retournés</h2>
  <p><strong>${esc(opts.employeeName)}</strong>${opts.employeeNumber ? ` (matricule ${esc(opts.employeeNumber)})` : ''}
  n'a pas rapporté ses uniformes${deadline ? ` à la date limite du ${esc(deadline)}` : ''}.
  Le dossier uniformes est clôturé dans TalentSecure.</p>
  <p style="font-size:18px;">Montant à retenir sur la paie : <strong style="color:#dc2626;">${money(opts.amountOwed)}</strong></p>
  ${rows ? `<table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr style="background:#f3f4f6;">
    <th style="text-align:left;padding:6px 8px;border:1px solid #d1d5db;">Pièce</th>
    <th style="text-align:left;padding:6px 8px;border:1px solid #d1d5db;">Taille</th>
    <th style="text-align:right;padding:6px 8px;border:1px solid #d1d5db;">Qté</th>
    <th style="text-align:right;padding:6px 8px;border:1px solid #d1d5db;">Valeur</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
  <p style="margin-top:16px;">Si l'employé rapporte des pièces plus tard, vous recevrez un courriel avec le montant à rembourser.</p>
  <p><a href="${esc(opts.link)}" style="background:#2563eb;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Voir la fiche dans TalentSecure</a></p>
  <p style="font-size:12px;color:#6b7280;">TalentSecure — avis automatique. RH est en copie.</p>
</div>`;
}

/**
 * Notifie la PAIE (CC RH) de la dette finale d'un employé après clôture(s) de
 * fin d'emploi, avec la liste des pièces. À appeler UNE seule fois par employé
 * (après avoir clôturé toutes ses remises) pour que le montant `owed` reflète le
 * total final, pas un cumul partiel croissant. Idempotent dans la journée via
 * dedupKey. RH/admins reçoivent aussi l'alerte dans l'app.
 */
export async function notifyTerminationClosed(employeeId: string): Promise<void> {
  try {
    const owed = await computeAmountOwed(employeeId);
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : 'Agent';
    const day = new Date().toISOString().split('T')[0];

    const closureLines = await prisma.uniformReturnLine.findMany({
      where: {
        condition: 'NOT_RETURNED',
        return: { employeeId, status: 'RETURNED', isLateReturn: false },
      },
      include: { variant: { include: { item: true } } },
    });
    const lines = closureLines.map((l) => ({
      itemName: l.variant?.item.name ?? 'Pièce',
      size: l.variant?.size ?? '',
      quantity: l.quantity,
      lineTotal: Math.round(l.quantity * Number(l.unitReplacementCost) * 100) / 100,
    }));

    await notify({
      type: 'UNIFORM_TERMINATION_CLOSED',
      channels: ['IN_APP'],
      audience: 'ADMINS',
      dedupKey: `termination-closed-${employeeId}-${day}`,
      title: `Fin d'emploi clôturée — ${employeeName}`,
      message: `Dette uniforme : ${owed.owed.toFixed(2)} $ transmise à la paie`,
      link: `/employees/${employeeId}`,
      payload: { employeeId, amountOwed: owed.owed },
    }).catch(() => {});
    if (owed.owed <= 0) return;
    await notify({
      type: 'UNIFORM_TERMINATION_CLOSED',
      channels: ['EMAIL'],
      audience: 'PAIE',
      dedupKey: `termination-closed-paie-${employeeId}-${day}`,
      title: `Retenue uniformes — ${employeeName} — ${owed.owed.toFixed(2)} $`,
      message: `Montant à retenir sur la paie : ${owed.owed.toFixed(2)} $`,
      link: `/employees/${employeeId}`,
      payload: {
        employeeId,
        amountOwed: owed.owed,
        emailCc: [EMAIL_RH],
        emailHtml: buildPayrollDeductionHtml({
          employeeName,
          employeeNumber: employee?.employeeNumber,
          deadline: employee?.uniformReturnDeadlineAt ?? null,
          lines,
          amountOwed: owed.owed,
          link: `${appBaseUrl()}/employees/${employeeId}`,
        }),
      },
    }).catch(() => {});
  } catch (e) {
    console.error('notifyTerminationClosed failed:', e);
  }
}
