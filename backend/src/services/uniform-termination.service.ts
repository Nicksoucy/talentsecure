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
import { Prisma, UniformItemCondition } from '@prisma/client';
import { prisma } from '../config/database';
import { notify } from './notification.service';
import { EMAIL_RH } from './email.service';
import { estimateHoldingsCost } from './employee-offboarding.service';
import { computeAmountOwed, computeHoldings } from './uniform-stock.service';
import { formatLongFr } from '../utils/montreal-date';

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
): Promise<{ returnId: string; employeeId: string; waived: boolean } | null> {
  if (!['ISSUED', 'PARTIALLY_RETURNED'].includes(issuance.status)) return null;
  // Règle RH : l'agent a rapporté des uniformes depuis la fermeture de son
  // dossier → le retour est complet pour la paie, le reste n'est pas facturé.
  const returnedAt = await returnedSinceClosure(issuance.employeeId);
  const waived = returnedAt !== null;

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
      unitReplacementCost: waived ? 0 : x.cost,
    }));

  const created = await prisma.$transaction(async (tx) => {
    const ret = await tx.uniformReturn.create({
      data: {
        issuanceId: issuance.id,
        employeeId: issuance.employeeId,
        status: 'RETURNED',
        returnedAt: new Date(),
        notes: waived
          ? `${reason} — sans retenue : l’agent a rapporté des uniformes le ${formatLongFr(returnedAt!)} (retour considéré complet, règle RH)`
          : reason,
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

  return { returnId: created.id, employeeId: issuance.employeeId, waived };
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
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Courriel à la paie : pièces non retournées + montant à retenir. */
export function buildPayrollDeductionHtml(opts: {
  employeeName: string;
  employeeNumber?: string | null;
  deadline: Date | null;
  lines: Array<{ itemName: string; size: string; quantity: number; lineTotal: number }>;
  amountOwed: number;
  /** Retenues déjà demandées à la paie pour cet employé (courriels précédents). */
  previouslyRequested?: number;
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
  ${
    opts.previouslyRequested && opts.previouslyRequested > 0
      ? `<p>Ce montant s’ajoute à ${money(opts.previouslyRequested)} déjà demandé${opts.previouslyRequested > 1 ? 's' : ''} dans un courriel précédent :
  <strong>total à retenir pour cet employé : ${money(round2(opts.previouslyRequested + opts.amountOwed))}</strong>.</p>`
      : ''
  }
  ${rows ? `<table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr style="background:#f3f4f6;">
    <th style="text-align:left;padding:6px 8px;border:1px solid #d1d5db;">Pièce</th>
    <th style="text-align:left;padding:6px 8px;border:1px solid #d1d5db;">Taille</th>
    <th style="text-align:right;padding:6px 8px;border:1px solid #d1d5db;">Qté</th>
    <th style="text-align:right;padding:6px 8px;border:1px solid #d1d5db;">Valeur</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
  <p style="margin-top:16px;">S'il rapporte des uniformes plus tard, même en partie, tout le montant retenu lui sera remboursé : vous recevrez un courriel.</p>
  <p><a href="${esc(opts.link)}" style="background:#2563eb;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Voir la fiche dans TalentSecure</a></p>
  <p style="font-size:12px;color:#6b7280;">TalentSecure — avis automatique. RH est en copie.</p>
</div>`;
}

const CLOSURE_PAIE_TYPE = 'UNIFORM_TERMINATION_CLOSED' as const;
const LATE_REFUND_PAIE_TYPE = 'UNIFORM_SETTLEMENT_RECORDED' as const;

/** Somme d'un champ numérique des courriels envoyés à la paie (échecs exclus). */
async function sumPayrollEmails(
  employeeId: string,
  type: typeof CLOSURE_PAIE_TYPE | typeof LATE_REFUND_PAIE_TYPE,
  dedupPrefix: string,
  pick: (payload: Record<string, unknown>) => unknown,
  since?: Date | null
): Promise<number> {
  const sent = await prisma.notification.findMany({
    where: {
      type,
      channel: 'EMAIL',
      status: { not: 'FAILED' },
      dedupKey: { startsWith: dedupPrefix },
      payload: { path: ['employeeId'], equals: employeeId },
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    select: { payload: true },
  });
  return round2(sent.reduce((sum, n) => sum + (Number(pick((n.payload ?? {}) as Record<string, unknown>)) || 0), 0));
}

/**
 * Retenues réellement DEMANDÉES à la paie depuis la fermeture du dossier : la
 * somme des courriels « Retenue uniformes » partis (pas ce que TalentSecure a
 * calculé — un courriel bloqué ou en échec n'a rien demandé à la paie).
 * Anciens courriels (avant 2026-10) : `amountOwed` = solde au moment de l'envoi.
 */
export async function payrollWithholdingRequested(employeeId: string): Promise<number> {
  return sumPayrollEmails(
    employeeId,
    CLOSURE_PAIE_TYPE,
    'termination-closed-paie-',
    (p) => p.amountToWithhold ?? p.amountOwed,
    await closureSince(employeeId)
  );
}

/** Remboursements déjà annoncés à la paie (courriels « rapportés en retard »). */
async function payrollRefundAnnounced(employeeId: string): Promise<number> {
  return sumPayrollEmails(
    employeeId,
    LATE_REFUND_PAIE_TYPE,
    'late-return-paie-',
    (p) => p.amountToRefund ?? p.amount,
    await closureSince(employeeId)
  );
}

/**
 * Notifie la PAIE (CC RH) des pièces non rapportées par les clôtures de fin
 * d'emploi `returnIds` (retours NOT_RETURNED créés par closeTerminationCore).
 * UN courriel par appel, avec le montant de CES clôtures seulement — une 2ᵉ
 * clôture le même jour envoie son propre courriel (avant : bloquée par une
 * clé « une fois par jour », la paie ne recevait que le 1ᵉʳ montant). Le job
 * passe toutes les remises clôturées d'un employé en un seul appel → un seul
 * courriel. RH/admins reçoivent aussi l'alerte dans l'app.
 */
export async function notifyTerminationClosed(employeeId: string, returnIds: string[]): Promise<void> {
  try {
    const ids = [...new Set(returnIds)].sort();
    if (ids.length === 0) return;
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : 'Agent';

    const closureLines = await prisma.uniformReturnLine.findMany({
      where: { condition: 'NOT_RETURNED', returnId: { in: ids } },
      include: { variant: { include: { item: true } } },
    });
    const lines = closureLines
      .map((l) => ({
        itemName: l.variant?.item.name ?? 'Pièce',
        size: l.variant?.size ?? '',
        quantity: l.quantity,
        lineTotal: round2(l.quantity * Number(l.unitReplacementCost)),
      }))
      .filter((l) => l.lineTotal > 0);
    const amount = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
    const previouslyRequested = amount > 0 ? await payrollWithholdingRequested(employeeId) : 0;
    const key = ids.join(',');

    await notify({
      type: CLOSURE_PAIE_TYPE,
      channels: ['IN_APP'],
      audience: 'ADMINS',
      dedupKey: `termination-closed-${key}`,
      title: `Fin d'emploi clôturée — ${employeeName}`,
      message:
        amount > 0
          ? `Retenue uniforme : ${amount.toFixed(2)} $ transmise à la paie`
          : 'Aucune retenue sur la paie (uniformes rapportés ou rien à facturer)',
      link: `/employees/${employeeId}`,
      payload: { employeeId, amountToWithhold: amount },
    }).catch(() => {});
    if (amount <= 0) return;
    const total = round2(previouslyRequested + amount);
    await notify({
      type: CLOSURE_PAIE_TYPE,
      channels: ['EMAIL'],
      audience: 'PAIE',
      dedupKey: `termination-closed-paie-${key}`,
      title: `Retenue uniformes — ${employeeName} — ${amount.toFixed(2)} $`,
      message:
        `Montant à retenir sur la paie : ${amount.toFixed(2)} $` +
        (previouslyRequested > 0 ? ` (total à retenir pour cet employé : ${total.toFixed(2)} $)` : ''),
      link: `/employees/${employeeId}`,
      payload: {
        employeeId,
        returnIds: ids,
        amountToWithhold: amount,
        totalRequested: total,
        emailCc: [EMAIL_RH],
        emailHtml: buildPayrollDeductionHtml({
          employeeName,
          employeeNumber: employee?.employeeNumber,
          deadline: employee?.uniformReturnDeadlineAt ?? null,
          lines,
          amountOwed: amount,
          previouslyRequested,
          link: `${appBaseUrl()}/employees/${employeeId}`,
        }),
      },
    }).catch(() => {});
  } catch (e) {
    console.error('notifyTerminationClosed failed:', e);
  }
}

// ---------------------------------------------------------------------------
// Règle RH (2026-09-30) : un retour, même partiel, compte comme complet
// ---------------------------------------------------------------------------
// Dès qu'un agent dont le dossier est fermé RAPPORTE des uniformes, la paie
// considère le retour complet : rien n'est retenu, ni pour les pièces qui
// manquent, ni pour celles rapportées abîmées ou déclarées perdues. Seul
// l'agent qui ne rapporte RIEN avant la date limite voit le montant retenu.
// « Rapporter » = au moins une pièce physiquement rendue (bon état ou abîmée) ;
// déclarer des pièces perdues sans rien rapporter ne compte pas.

const PHYSICAL_CONDITIONS: UniformItemCondition[] = ['GOOD', 'DAMAGED'];
const CHARGED_CONDITIONS: UniformItemCondition[] = ['DAMAGED', 'LOST', 'NOT_RETURNED'];

/** Début de la fin d'emploi : la dernière lettre « Fermer le dossier », sinon la date de fin d'emploi. */
async function closureSince(employeeId: string): Promise<Date | null> {
  const [notice, emp] = await Promise.all([
    prisma.employeeOffboardingNotice.findFirst({
      where: { employeeId },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    }),
    prisma.employee.findUnique({ where: { id: employeeId }, select: { terminationDate: true } }),
  ]);
  return notice?.sentAt ?? emp?.terminationDate ?? null;
}

/**
 * Date du premier retour PHYSIQUE (dans les délais) depuis la fermeture du
 * dossier — la dernière lettre « Fermer le dossier », sinon la fin d'emploi.
 * Null si l'agent n'a rien rapporté (ou si son dossier n'a jamais été fermé).
 */
export async function returnedSinceClosure(employeeId: string, excludeReturnId?: string): Promise<Date | null> {
  const since = await closureSince(employeeId);
  if (!since) return null;
  const first = await prisma.uniformReturn.findFirst({
    where: {
      employeeId,
      status: 'RETURNED',
      isLateReturn: false,
      returnedAt: { gte: since },
      ...(excludeReturnId ? { id: { not: excludeReturnId } } : {}),
      lines: { some: { condition: { in: PHYSICAL_CONDITIONS } } },
    },
    orderBy: { returnedAt: 'asc' },
    select: { returnedAt: true },
  });
  return first?.returnedAt ?? null;
}

/**
 * Ce retour (pas encore finalisé) tombe-t-il sous la règle RH ? Oui si l'agent
 * est parti, que son dossier a été fermé, et qu'il rapporte des pièces
 * maintenant ou l'a déjà fait depuis la fermeture. Ses pièces abîmées ou
 * perdues ne sont alors pas facturées.
 */
export async function isClosureReturnWaived(ret: {
  id: string;
  employeeId: string;
  isLateReturn: boolean;
  lines: { condition: UniformItemCondition }[];
}): Promise<boolean> {
  if (ret.isLateReturn) return false;
  const emp = await prisma.employee.findUnique({
    where: { id: ret.employeeId },
    select: { status: true, terminationDate: true, offboardingNotices: { select: { id: true }, take: 1 } },
  });
  if (!emp || emp.status !== 'INACTIF') return false;
  if (!emp.terminationDate && emp.offboardingNotices.length === 0) return false;
  if (ret.lines.some((l) => PHYSICAL_CONDITIONS.includes(l.condition))) return true;
  return (await returnedSinceClosure(ret.employeeId, ret.id)) !== null;
}

const CONDITION_FR: Record<string, string> = {
  GOOD: 'Bon état',
  DAMAGED: 'Abîmée',
  LOST: 'Perdue',
  NOT_RETURNED: 'Non rapportée',
};

export interface PayrollReturnSummary {
  employeeName: string;
  employeeNumber?: string | null;
  returnedAt: Date;
  /** Pièces de CE retour, avec leur état. */
  received: Array<{ itemName: string; size: string; quantity: number; condition: string }>;
  /** Pièces encore chez l'agent — non facturées (règle RH). */
  missingPieces: number;
  /** Montant annoncé dans la lettre de fermeture (ce que la paie retient). */
  letterAmount: number;
  link: string;
}

const CELL = 'padding:6px 8px;border:1px solid #d1d5db;';

function receivedTableHtml(received: PayrollReturnSummary['received']): string {
  const rows = received
    .map(
      (r) => `<tr><td style="${CELL}">${esc(r.itemName)}</td><td style="${CELL}">${esc(r.size)}</td>
      <td style="${CELL}text-align:right;">${r.quantity}</td><td style="${CELL}">${esc(r.condition)}</td></tr>`
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 12px;"><thead><tr style="background:#f3f4f6;">
    <th style="text-align:left;${CELL}">Pièce</th><th style="text-align:left;${CELL}">Taille</th>
    <th style="text-align:right;${CELL}">Qté</th><th style="text-align:left;${CELL}">État</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const amountRow = (label: string, value: string) =>
  `<tr><td style="${CELL}">${label}</td><td style="${CELL}text-align:right;"><strong>${value}</strong></td></tr>`;

/** « Deuxième courriel » à la paie : l'agent a rapporté des uniformes, rien à retenir. */
export function buildPayrollReturnHtml(s: PayrollReturnSummary): string {
  const row = amountRow;
  return `<div style="font-family:Arial,sans-serif;color:#111827;max-width:640px;margin:0 auto;padding:20px;">
  <h2 style="color:#15803d;margin-top:0;">Uniformes rapportés — rien à retenir</h2>
  <p><strong>${esc(s.employeeName)}</strong>${s.employeeNumber ? ` (matricule ${esc(s.employeeNumber)})` : ''}
  a rapporté des uniformes le ${esc(formatLongFr(s.returnedAt))}. Sa lettre de fermeture annonçait une retenue de ${money(s.letterAmount)}.</p>
  <p style="margin-bottom:0;"><strong>Pièces reçues</strong></p>
  ${receivedTableHtml(s.received)}
  ${
    s.missingPieces > 0
      ? `<p>${s.missingPieces} pièce${s.missingPieces > 1 ? 's n’ont' : ' n’a'} pas été rapportée${s.missingPieces > 1 ? 's' : ''} : ${
          s.missingPieces > 1 ? 'elles ne sont pas facturées' : 'elle n’est pas facturée'
        }.</p>`
      : ''
  }
  <table style="width:100%;border-collapse:collapse;font-size:15px;margin:8px 0 12px;"><tbody>
    ${row('Montant à retenir sur la paie', money(0))}
    ${row('À remettre à l’employé (ou à ne pas retenir)', money(s.letterAmount))}
  </tbody></table>
  <p>Règle convenue avec les RH : dès qu’un agent rapporte ses uniformes, le retour est considéré complet pour la paie, même s’il manque des pièces.
  Si le montant de ${money(s.letterAmount)} a déjà été retenu, il est à remettre en entier.</p>
  <p><a href="${esc(s.link)}" style="background:#2563eb;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Voir la fiche dans TalentSecure</a></p>
  <p style="font-size:12px;color:#6b7280;">TalentSecure — avis automatique. RH est en copie.</p>
</div>`;
}

/**
 * Après un retour finalisé DANS LES DÉLAIS : si c'est le PREMIER retour
 * physique depuis la lettre de fermeture et que la lettre est partie (la paie
 * l'a reçue en copie avec un montant), écrit à la paie (CC RH) que le retour
 * est complet et qu'il n'y a rien à retenir. Les retours suivants ne changent
 * rien pour la paie : pas de nouveau courriel. Renvoie le résumé envoyé, ou
 * null. Ne lève jamais.
 */
export async function notifyPayrollReturnReceived(returnId: string): Promise<PayrollReturnSummary | null> {
  try {
    const ret = await prisma.uniformReturn.findUnique({
      where: { id: returnId },
      include: { lines: { include: { variant: { include: { item: true } } } } },
    });
    if (!ret || ret.status !== 'RETURNED' || ret.isLateReturn) return null;
    if (!ret.lines.some((l) => PHYSICAL_CONDITIONS.includes(l.condition))) return null;
    const employee = await prisma.employee.findUnique({
      where: { id: ret.employeeId },
      select: { firstName: true, lastName: true, employeeNumber: true, status: true },
    });
    // Un employé actif qui échange ses uniformes ne concerne pas la paie.
    if (!employee || employee.status !== 'INACTIF') return null;
    const returnedAt = ret.returnedAt ?? new Date();
    const notice = await prisma.employeeOffboardingNotice.findFirst({
      where: { employeeId: ret.employeeId, emailStatus: 'SENT', sentAt: { lte: returnedAt } },
      orderBy: { sentAt: 'desc' },
    });
    const letterAmount = notice ? Number(notice.estimatedAmount) : 0;
    // Pas de lettre partie, ou lettre sans montant : la paie ne retient rien.
    if (!notice || !(letterAmount > 0)) return null;
    // La paie a déjà été avisée par un retour précédent.
    const earlier = await prisma.uniformReturn.findFirst({
      where: {
        employeeId: ret.employeeId,
        id: { not: ret.id },
        status: 'RETURNED',
        isLateReturn: false,
        returnedAt: { gte: notice.sentAt },
        lines: { some: { condition: { in: PHYSICAL_CONDITIONS } } },
      },
      select: { id: true },
    });
    if (earlier) return null;

    const remaining = await estimateHoldingsCost(ret.employeeId);
    const employeeName = `${employee.firstName} ${employee.lastName}`;
    const summary: PayrollReturnSummary = {
      employeeName,
      employeeNumber: employee.employeeNumber,
      returnedAt,
      received: ret.lines.map((l) => ({
        itemName: l.variant?.item.name ?? l.customItemName ?? 'Pièce',
        size: l.variant?.size ?? '',
        quantity: l.quantity,
        condition: CONDITION_FR[l.condition] ?? l.condition,
      })),
      missingPieces: remaining.totalPieces,
      letterAmount,
      link: `${appBaseUrl()}/employees/${ret.employeeId}`,
    };
    await notify({
      type: 'UNIFORM_SETTLEMENT_RECORDED',
      channels: ['EMAIL'],
      audience: 'PAIE',
      dedupKey: `closure-return-paie-${ret.id}`,
      title: `Uniformes rapportés — ${employeeName} — rien à retenir`,
      message:
        `${employeeName} a rapporté des uniformes : retour considéré complet (règle RH). ` +
        `Rien à retenir ; si ${letterAmount.toFixed(2)} $ ont été retenus, ils sont à remettre.`,
      link: summary.link,
      payload: {
        employeeId: ret.employeeId,
        returnId: ret.id,
        noticeId: notice.id,
        letterAmount,
        amountToKeep: 0,
        amountToRelease: letterAmount,
        missingPieces: summary.missingPieces,
        emailCc: [EMAIL_RH],
        emailHtml: buildPayrollReturnHtml(summary),
      },
    });
    return summary;
  } catch (e) {
    console.error('notifyPayrollReturnReceived failed:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Règle RH (2026-09-30), après la date limite : on rembourse TOUT
// ---------------------------------------------------------------------------
// L'agent qui rapporte des uniformes APRÈS la clôture de son dossier (retour
// tardif), même en partie, récupère tout ce qui a été retenu pour sa fin
// d'emploi. Pas plafonné au solde dû : si la paie a déjà retenu le montant (et
// l'a inscrit comme « RETENUE PAIE »), c'est un vrai remboursement à lui verser.

export const LATE_RETURN_METHOD = 'RETOUR TARDIF';

/**
 * Pièces remises qui ne sont PAS revenues physiquement (ni rapportées, ni
 * déclarées perdues). Différent de computeHoldings : après une clôture, les
 * lignes NOT_RETURNED mettent les détentions à 0 alors que l'agent a encore
 * les pièces — c'est justement ce que la paie veut savoir.
 */
async function piecesNotPhysicallyBack(employeeId: string): Promise<number> {
  const [issued, back] = await Promise.all([
    prisma.uniformIssuanceLine.aggregate({
      where: { issuance: { employeeId, status: { notIn: ['DRAFT', 'CANCELLED'] } }, variantId: { not: null } },
      _sum: { quantity: true },
    }),
    prisma.uniformReturnLine.aggregate({
      where: {
        condition: { in: [...PHYSICAL_CONDITIONS, 'LOST'] },
        variantId: { not: null },
        return: { employeeId, status: 'RETURNED' },
      },
      _sum: { quantity: true },
    }),
  ]);
  return Math.max(0, (issued._sum.quantity ?? 0) - (back._sum.quantity ?? 0));
}

/**
 * Montant à rembourser à un agent qui rapporte des uniformes en retard : tout ce
 * qui a été facturé depuis la fermeture de son dossier (pièces non rapportées,
 * perdues, abîmées), moins ce qu'un retour tardif précédent a déjà remboursé.
 */
export async function lateReturnRefundDue(employeeId: string): Promise<{ charged: number; alreadyRefunded: number; due: number }> {
  const since = await closureSince(employeeId);
  const [lines, refunds] = await Promise.all([
    prisma.uniformReturnLine.findMany({
      where: {
        condition: { in: CHARGED_CONDITIONS },
        return: { employeeId, status: 'RETURNED', isLateReturn: false, ...(since ? { returnedAt: { gte: since } } : {}) },
      },
      select: { quantity: true, unitReplacementCost: true },
    }),
    prisma.uniformDebtSettlement.aggregate({
      where: { employeeId, method: LATE_RETURN_METHOD, ...(since ? { createdAt: { gte: since } } : {}) },
      _sum: { amount: true },
    }),
  ]);
  const charged = round2(lines.reduce((sum, l) => sum + l.quantity * Number(l.unitReplacementCost), 0));
  const alreadyRefunded = round2(Number(refunds._sum.amount ?? 0));
  return { charged, alreadyRefunded, due: Math.max(0, round2(charged - alreadyRefunded)) };
}

/** Courriel à la paie : uniformes rapportés en retard, tout le montant retenu est à rembourser. */
export function buildPayrollLateRefundHtml(s: {
  employeeName: string;
  employeeNumber?: string | null;
  returnedAt: Date;
  received: PayrollReturnSummary['received'];
  charged: number;
  alreadyRefunded: number;
  refund: number;
  /** Pièces encore chez l'agent après ce retour (0 = retour complet). */
  otherPieces?: number;
  link: string;
}): string {
  return `<div style="font-family:Arial,sans-serif;color:#111827;max-width:640px;margin:0 auto;padding:20px;">
  <h2 style="color:#15803d;margin-top:0;">Uniformes rapportés en retard — tout est remboursé</h2>
  <p><strong>${esc(s.employeeName)}</strong>${s.employeeNumber ? ` (matricule ${esc(s.employeeNumber)})` : ''}
  a rapporté des uniformes le ${esc(formatLongFr(s.returnedAt))}, après la date limite.</p>
  <p style="margin-bottom:0;"><strong>Pièces reçues</strong></p>
  ${receivedTableHtml(s.received)}
  <table style="width:100%;border-collapse:collapse;font-size:15px;margin:8px 0 12px;"><tbody>
    ${amountRow('Retenue demandée à la paie pour les uniformes', money(s.charged))}
    ${s.alreadyRefunded > 0 ? amountRow('Remboursement déjà annoncé', money(s.alreadyRefunded)) : ''}
    ${amountRow('À rembourser à l’employé', money(s.refund))}
  </tbody></table>
  <p>Règle convenue avec les RH : tout retour d’uniformes compte comme complet, même en retard. Tout le montant retenu est donc à rembourser.
  Si la retenue n’a pas encore été faite, ne la faites pas.</p>
  ${s.otherPieces && s.otherPieces > 0 ? '' : '<p><strong>Il ne détient plus aucune pièce d’uniforme : le retour est complet.</strong></p>'}
  <p><a href="${esc(s.link)}" style="background:#2563eb;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Voir la fiche dans TalentSecure</a></p>
  <p style="font-size:12px;color:#6b7280;">TalentSecure — avis automatique. RH est en copie.</p>
</div>`;
}

/**
 * Après un RETOUR TARDIF finalisé (remise déjà clôturée) : si l'agent a
 * rapporté au moins une pièce, rembourse tout le montant encore dû à rembourser
 * (règlement « RETOUR TARDIF »), avise les admins et la paie (CC RH).
 * Renvoie le montant remboursé (0 si rien). Ne lève jamais.
 */
export async function refundLateReturn(returnId: string, createdById?: string | null): Promise<number> {
  try {
    const ret = await prisma.uniformReturn.findUnique({
      where: { id: returnId },
      include: { lines: { include: { variant: { include: { item: true } } } } },
    });
    if (!ret || ret.status !== 'RETURNED' || !ret.isLateReturn) return 0;
    if (!ret.lines.some((l) => PHYSICAL_CONDITIONS.includes(l.condition))) return 0;
    const { due } = await lateReturnRefundDue(ret.employeeId);
    if (due <= 0) return 0;
    // Ce que la PAIE doit rembourser = ce qu'on lui a réellement demandé de
    // retenir, moins ce qu'on lui a déjà dit de rembourser — pas le montant
    // calculé par TalentSecure (cas Dahmouni 2026-10-07 : 50 $ demandés à la
    // paie, mais « 220 $ à rembourser » annoncés).
    const [requested, announced] = await Promise.all([
      payrollWithholdingRequested(ret.employeeId),
      payrollRefundAnnounced(ret.employeeId),
    ]);
    const payrollRefund = Math.max(0, round2(requested - announced));

    await prisma.uniformDebtSettlement.create({
      data: {
        employeeId: ret.employeeId,
        amount: due,
        method: LATE_RETURN_METHOD,
        notes: `Retour tardif ${ret.id} — remise ${ret.issuanceId} : retour considéré complet (règle RH), tout le montant retenu est remboursé`,
        createdById: createdById ?? null,
      },
    });

    const employee = await prisma.employee.findUnique({
      where: { id: ret.employeeId },
      select: { firstName: true, lastName: true, employeeNumber: true },
    });
    const name = employee ? `${employee.firstName} ${employee.lastName}` : 'Agent';
    const link = `${appBaseUrl()}/employees/${ret.employeeId}`;
    await notify({
      type: 'UNIFORM_SETTLEMENT_RECORDED',
      channels: ['IN_APP'],
      audience: 'ADMINS',
      title: 'Retour tardif — tout est remboursé',
      message:
        payrollRefund > 0
          ? `${name} a rapporté des uniformes après la date limite : ${payrollRefund.toFixed(2)} $ à lui rembourser (retour considéré complet, règle RH)`
          : `${name} a rapporté des uniformes après la date limite : rien n’avait été demandé à la paie, rien à rembourser`,
      link: `/employees/${ret.employeeId}`,
      payload: { returnId: ret.id, employeeId: ret.employeeId, amount: payrollRefund },
    }).catch((e) => console.error('notify failed:', e));
    // Rien n'a été demandé à la paie (ou déjà annoncé) : rien à lui écrire.
    if (payrollRefund <= 0) return due;
    const otherPieces = await piecesNotPhysicallyBack(ret.employeeId);
    await notify({
      type: 'UNIFORM_SETTLEMENT_RECORDED',
      channels: ['EMAIL'],
      audience: 'PAIE',
      dedupKey: `late-return-paie-${ret.id}`,
      title: `Uniformes rapportés en retard — ${name} — ${payrollRefund.toFixed(2)} $ à rembourser`,
      message:
        `${name}${employee?.employeeNumber ? ` (matricule ${employee.employeeNumber})` : ''} a rapporté des uniformes après la date limite.\n` +
        `Règle RH : tout retour compte comme complet. Montant à rembourser (ou à ne pas retenir) : ${payrollRefund.toFixed(2)} $.`,
      link,
      payload: {
        returnId: ret.id,
        employeeId: ret.employeeId,
        amount: due,
        amountToRefund: payrollRefund,
        requested,
        announced,
        emailCc: [EMAIL_RH],
        emailHtml: buildPayrollLateRefundHtml({
          employeeName: name,
          employeeNumber: employee?.employeeNumber,
          returnedAt: ret.returnedAt ?? new Date(),
          received: ret.lines.map((l) => ({
            itemName: l.variant?.item.name ?? l.customItemName ?? 'Pièce',
            size: l.variant?.size ?? '',
            quantity: l.quantity,
            condition: CONDITION_FR[l.condition] ?? l.condition,
          })),
          charged: requested,
          alreadyRefunded: announced,
          refund: payrollRefund,
          otherPieces,
          link,
        }),
      },
    }).catch((e) => console.error('notify failed:', e));
    return due;
  } catch (e) {
    console.error('refundLateReturn failed:', e);
    return 0;
  }
}
