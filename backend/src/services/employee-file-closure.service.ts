/**
 * « Fermer le dossier » d'un employé — en une action RH :
 *   1. passe l'employé à INACTIF et pose la date limite de retour des uniformes
 *      (+14 jours par défaut, modifiable) ;
 *   2. envoie la lettre « Fermeture de votre dossier XGuard » par courriel
 *      (À employé, CC paie@ + rh@) avec la liste des pièces et le montant qui
 *      sera déduit de la paie ;
 *   3. envoie un texto court (optionnel) ;
 *   4. garde une trace (`employee_offboarding_notices`, texte exact envoyé).
 *
 * Le jour limite dépassé, le job horaire (`checkInactiveEmployeesWithHoldings`)
 * clôture les remises et envoie le montant à retenir à la paie.
 *
 * Un échec d'envoi ne défait PAS la fermeture : l'erreur est enregistrée et RH
 * peut renvoyer (`resendClosureNotice`).
 */
import { EmployeeOffboardingNotice, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';
import { addDaysYmd, endOfDayMontreal, formatLongFr, montrealYmd } from '../utils/montreal-date';
import { EMAIL_PAIE, EMAIL_RH } from './email.service';
import { getContactById, isGhlConfigured } from './ghl.client';
import { lastTenDigits } from '../utils/phone';
import { upsertPersonContact } from './ghl-email.service';
import { sendEmailWithProvider } from './notification.service';
import { resolveGhlContactId, sendSms } from './sms.service';
import {
  buildDeactivationFields,
  estimateHoldingsCost,
  EstimatedPiece,
  HoldingsEstimate,
  propagateUniformOffboarding,
} from './employee-offboarding.service';
import { computeAmountOwed, computeHoldings } from './uniform-stock.service';
import { UNIFORM_RETURN_DEADLINE_CALENDAR_DAYS } from '../constants/uniform';

export const CLOSURE_REASONS = ['INACTIVITE', 'DEMISSION', 'FIN_EMPLOI'] as const;
export type ClosureReason = (typeof CLOSURE_REASONS)[number];

/** Paragraphe d'ouverture proposé par motif — RH peut le retoucher avant l'envoi. */
export const DEFAULT_REASON_TEXTS: Record<ClosureReason, string> = {
  INACTIVITE:
    "Nous vous informons que votre dossier est fermé en date d'aujourd'hui, puisque vous n'avez effectué aucun quart de travail depuis longtemps. Malgré votre disponibilité déclarée, vous avez décliné toutes les demandes de remplacement qui vous ont été adressées, et/ou vous n'y avez jamais répondu, ou encore vous ne vous êtes pas connecté à l'application Agendrix pour postuler sur les quarts disponibles. Cette situation ne nous permet plus de vous maintenir activement sur notre liste d'agents actifs.",
  DEMISSION:
    "Nous accusons réception de votre démission et vous informons que votre dossier est fermé en date d'aujourd'hui.",
  FIN_EMPLOI:
    "Nous vous informons que votre emploi au sein de Sécurité XGuard prend fin et que votre dossier est fermé en date d'aujourd'hui.",
};

export const CLOSURE_REASON_LABELS: Record<ClosureReason, string> = {
  INACTIVITE: 'Inactivité',
  DEMISSION: 'Démission',
  FIN_EMPLOI: "Fin d'emploi",
};

export const CLOSURE_EMAIL_SUBJECT = 'Fermeture de votre dossier XGuard';
const OFFICE_ADDRESS = '9380, boulevard Saint-Laurent, Montréal (Québec) H2N 1P3';

export interface ClosureInput {
  reason: ClosureReason;
  reasonText: string;
  /** Jour limite YYYY-MM-DD (fin de journée à Montréal). */
  deadline: string;
  sendSms: boolean;
}

export interface ClosureSigner {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

type ClosureEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  status: 'ACTIF' | 'INACTIF';
  terminationDate: Date | null;
  uniformReturnDeadlineAt: Date | null;
  isDeleted: boolean;
};

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function money(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} $`;
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px;text-align:justify;">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function piecesTable(pieces: EstimatedPiece[], total: number): string {
  const rows = pieces
    .map(
      (p) => `<tr>
        <td style="padding:6px 8px;border:1px solid #d1d5db;">${esc(p.itemName)}</td>
        <td style="padding:6px 8px;border:1px solid #d1d5db;">${esc(p.size)}</td>
        <td style="padding:6px 8px;border:1px solid #d1d5db;text-align:right;">${p.quantity}</td>
        <td style="padding:6px 8px;border:1px solid #d1d5db;text-align:right;">${money(p.lineTotal)}</td>
      </tr>`
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0 12px;font-size:14px;">
    <thead><tr style="background:#f3f4f6;">
      <th style="text-align:left;padding:6px 8px;border:1px solid #d1d5db;">Pièce</th>
      <th style="text-align:left;padding:6px 8px;border:1px solid #d1d5db;">Taille</th>
      <th style="text-align:right;padding:6px 8px;border:1px solid #d1d5db;">Qté</th>
      <th style="text-align:right;padding:6px 8px;border:1px solid #d1d5db;">Valeur</th>
    </tr></thead>
    <tbody>${rows}
      <tr><td colspan="3" style="padding:6px 8px;border:1px solid #d1d5db;text-align:right;"><strong>Total</strong></td>
      <td style="padding:6px 8px;border:1px solid #d1d5db;text-align:right;"><strong>${money(total)}</strong></td></tr>
    </tbody>
  </table>`;
}

/** Lettre « Fermeture de votre dossier XGuard » (reprend le modèle PDF de RH). */
export function buildClosureLetterHtml(opts: {
  reasonText: string;
  deadline: Date;
  estimate: Pick<HoldingsEstimate, 'pieces' | 'total'>;
  signer: ClosureSigner;
  date?: Date;
}): string {
  const h3 = (t: string) => `<h3 style="font-size:15px;margin:20px 0 8px;">${t}</h3>`;
  const p = (t: string) => `<p style="margin:0 0 12px;text-align:justify;">${t}</p>`;
  const signerName = [opts.signer.firstName, opts.signer.lastName].filter(Boolean).join(' ').trim();
  const deadlineText = `<strong style="background:#fef08a;">au plus tard le ${esc(formatLongFr(opts.deadline))}</strong>`;

  const uniforms =
    opts.estimate.pieces.length > 0
      ? p('Selon nos registres, vous détenez toujours les pièces suivantes :') +
        piecesTable(opts.estimate.pieces, opts.estimate.total) +
        p(
          `<strong>À défaut de retour complet dans ce délai, un montant de ${money(
            opts.estimate.total
          )} correspondant à la valeur des pièces non retournées sera déduit de votre paie.</strong>`
        )
      : '';

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>${CLOSURE_EMAIL_SUBJECT}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:14px;line-height:1.5;max-width:680px;margin:0 auto;padding:24px;">
  <div style="text-align:center;font-size:22px;letter-spacing:6px;font-weight:bold;margin-bottom:24px;">SÉCURITÉ XGUARD</div>
  <p style="margin:0 0 12px;">Montréal, le ${esc(formatLongFr(opts.date ?? new Date()))}</p>
  <p style="margin:0 0 12px;">SOUS TOUTES RÉSERVES<br>STRICTEMENT CONFIDENTIEL<br>REMIS PAR COURRIEL</p>
  <p style="margin:0 0 4px;"><strong>OBJET : Fermeture de votre dossier XGuard</strong></p>
  <hr style="border:0;border-top:1px solid #111827;margin:0 0 16px;">
  <p style="margin:0 0 12px;">Bonjour,</p>
  ${paragraphs(opts.reasonText)}
  ${h3('Salaire, vacances accumulées et indemnité tenant lieu de préavis (si applicable)')}
  ${p("Vous recevrez à l'expiration de la prochaine période de paie, tout salaire accumulé en date de ce jour, ainsi que toute paie de vacances accumulée, mais non utilisée.")}
  ${h3("Relevé d'emploi")}
  ${p('Un relevé d\'emploi (RE) sera déposé électroniquement auprès de Service Canada, conformément aux exigences applicables. Pour obtenir une copie de votre relevé d\'emploi, veuillez consulter Mon dossier Service Canada à l\'adresse suivante : <a href="https://www.servicecanada.gc.ca/eng/online/mysca.shtml">www.servicecanada.gc.ca/eng/online/mysca.shtml</a>.')}
  ${p(`Si vous souhaitez obtenir une copie de votre relevé d'emploi par un autre moyen que votre dossier sur l'ARC, veuillez communiquer avec le service des paies à l'adresse courriel suivante : <a href="mailto:${esc(EMAIL_PAIE)}">${esc(EMAIL_PAIE)}</a>`)}
  ${h3('Retour des biens de la Compagnie')}
  ${p(`Vous devez retourner l'ensemble des biens appartenant à la Compagnie, qui sont toujours en votre possession. Cela inclut notamment tous les uniformes, équipements, accessoires ou tout autre matériel qui vous a été remis dans le cadre de votre emploi. Ce retour doit être effectué ${deadlineText}, soit en personne à nos bureaux du lundi au vendredi entre 9h et 15h30, soit par la poste (Postes Canada) à l'adresse suivante : ${esc(OFFICE_ADDRESS)}.`)}
  ${uniforms}
  ${h3('Rappel de vos obligations')}
  ${p("Nous profitons de cette occasion pour vous rappeler que conformément au <em>Code civil du Québec</em>, vous conservez à l'égard de la Compagnie certaines obligations qui continuent de s'appliquer malgré la fin de votre emploi. Vous êtes également lié par le devoir de loyauté que vous impose la loi envers la Compagnie, pour une période raisonnable suite à votre terminaison d'emploi. Ainsi, vous ne pouvez pas faire usage de l'information à caractère confidentiel que vous avez obtenue dans l'exécution ou à l'occasion de votre emploi au sein de la Compagnie, que ce soit au profit d'un tiers ou pour votre usage personnel.")}
  ${p("Également, il ne vous sera pas loisible de détourner les occasions d'affaires dont vous auriez pu prendre connaissance dans le cadre de l'exercice de vos fonctions ou de solliciter nos salariés afin qu'ils entrent au service d'une tierce partie, et ce tant directement qu'indirectement.")}
  ${p("Nous vous souhaitons bon succès dans vos projets futurs et vous prions d'agréer, l'expression de nos sentiments distingués.")}
  <p style="margin:24px 0 0;">${signerName ? `<strong>${esc(signerName)}</strong><br>` : ''}Les Ressources Humaines<br>
  <a href="mailto:${esc(EMAIL_RH)}">${esc(EMAIL_RH)}</a><br>Sécurité XGuard<br>9380 Boulevard Saint-Laurent, H2N 1P3</p>
</body></html>`;
}

/** Texto court (≤ 320 caractères visés). */
export function buildClosureSms(opts: { firstName: string; deadline: Date; total: number; hasPieces: boolean }): string {
  const day = formatLongFr(opts.deadline).replace(/ \d{4}$/, '');
  const head = `Sécurité XGuard : Bonjour ${opts.firstName}, votre dossier est fermé.`;
  const body = opts.hasPieces
    ? ` Veuillez rapporter vos uniformes d'ici le ${day} au 9380 boul. Saint-Laurent (lun-ven 9h-15h30) ou par la poste, sinon ${money(opts.total)} sera déduit de votre paie.`
    : ` Veuillez retourner tout bien de la Compagnie d'ici le ${day} au 9380 boul. Saint-Laurent (lun-ven 9h-15h30) ou par la poste.`;
  // Les courriels GHL tombent souvent dans les indésirables : on le dit.
  return `${head}${body} Détails par courriel (vérifiez vos courriels indésirables).`;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

async function loadEmployee(employeeId: string): Promise<ClosureEmployee> {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      terminationDate: true,
      uniformReturnDeadlineAt: true,
      isDeleted: true,
    },
  });
  if (!emp || emp.isDeleted) throw new ApiError(404, 'Employé non trouvé');
  return emp;
}

/** Valide le jour limite (YYYY-MM-DD, pas dans le passé) et le convertit. */
export function parseDeadline(ymd: string, now: Date = new Date()): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new ApiError(400, 'Date limite invalide (AAAA-MM-JJ)');
  if (ymd < montrealYmd(now)) throw new ApiError(400, 'La date limite ne peut pas être dans le passé');
  return endOfDayMontreal(ymd);
}

export type ClosureTrackingStatus = 'EN_ATTENTE' | 'RAPPORTE' | 'TRANSMIS_PAIE' | 'AUCUN_UNIFORME';

/**
 * Ce que la fiche employé affiche : valeurs par défaut du formulaire, estimation
 * des uniformes détenus, et historique des avis avec leur état de suivi.
 */
export async function getClosureOverview(employeeId: string) {
  const emp = await loadEmployee(employeeId);
  const [estimate, notices, holdings, owed] = await Promise.all([
    estimateHoldingsCost(employeeId),
    prisma.employeeOffboardingNotice.findMany({
      where: { employeeId },
      orderBy: { sentAt: 'desc' },
      select: {
        id: true,
        sentAt: true,
        sentByName: true,
        reason: true,
        returnDeadlineAt: true,
        emailTo: true,
        emailCc: true,
        emailStatus: true,
        emailError: true,
        smsTo: true,
        smsStatus: true,
        smsError: true,
        estimatedAmount: true,
        piecesSnapshot: true,
      },
    }),
    computeHoldings(employeeId),
    computeAmountOwed(employeeId),
  ]);

  let tracking: { status: ClosureTrackingStatus; daysLeft: number | null; owed: number } | null = null;
  const latest = notices[0];
  if (latest) {
    const hadPieces = Array.isArray(latest.piecesSnapshot) && latest.piecesSnapshot.length > 0;
    const closedLines = await prisma.uniformReturnLine.count({
      where: {
        condition: 'NOT_RETURNED',
        return: { employeeId, status: 'RETURNED', isLateReturn: false, returnedAt: { gte: latest.sentAt } },
      },
    });
    let status: ClosureTrackingStatus;
    if (holdings.length > 0) status = 'EN_ATTENTE';
    else if (closedLines > 0) status = 'TRANSMIS_PAIE';
    else status = hadPieces ? 'RAPPORTE' : 'AUCUN_UNIFORME';
    // Jours de CALENDRIER restants (heure de Montréal) : « jusqu'au 14 » vu le
    // 30 sept = 14 jours, peu importe l'heure de la journée.
    const ymdToUtc = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
    const daysLeft = Math.round(
      (ymdToUtc(montrealYmd(latest.returnDeadlineAt)) - ymdToUtc(montrealYmd())) / 86_400_000
    );
    tracking = {
      status,
      daysLeft: status === 'EN_ATTENTE' ? Math.max(0, daysLeft) : null,
      owed: owed.owed,
    };
  }

  return {
    employee: {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email,
      phone: emp.phone,
      status: emp.status,
    },
    defaults: {
      deadline: addDaysYmd(montrealYmd(), UNIFORM_RETURN_DEADLINE_CALENDAR_DAYS),
      reasonTexts: DEFAULT_REASON_TEXTS,
      reasonLabels: CLOSURE_REASON_LABELS,
      cc: [EMAIL_PAIE, EMAIL_RH],
      subject: CLOSURE_EMAIL_SUBJECT,
    },
    estimate,
    notices: notices.map((n) => ({ ...n, estimatedAmount: Number(n.estimatedAmount) })),
    tracking,
  };
}

/** Aperçu exact du courriel et du texto, sans rien modifier. */
export async function previewClosure(employeeId: string, input: ClosureInput, signer: ClosureSigner) {
  const emp = await loadEmployee(employeeId);
  const deadline = parseDeadline(input.deadline);
  const estimate = await estimateHoldingsCost(employeeId);
  return {
    subject: CLOSURE_EMAIL_SUBJECT,
    to: emp.email,
    cc: [EMAIL_PAIE, EMAIL_RH],
    html: buildClosureLetterHtml({ reasonText: input.reasonText, deadline, estimate, signer }),
    sms: buildClosureSms({
      firstName: emp.firstName,
      deadline,
      total: estimate.total,
      hasPieces: estimate.pieces.length > 0,
    }),
    estimate,
  };
}

// ---------------------------------------------------------------------------
// Envoi
// ---------------------------------------------------------------------------

type ChannelResult = { status: 'SENT' | 'FAILED' | 'SKIPPED'; error: string | null };

function errMessage(e: unknown): string {
  return ((e as Error)?.message || String(e)).slice(0, 500);
}

/**
 * Contact GHL pour le COURRIEL : retrouvé/créé par l'adresse seulement. On
 * n'y écrit pas le téléphone : une fiche GHL existante peut appartenir à la même
 * personne avec un autre numéro (vieux cellulaire) — on ne l'écrase pas.
 */
async function emailContactId(emp: ClosureEmployee): Promise<string | null> {
  if (!isGhlConfigured() || !emp.email?.trim()) return null;
  try {
    return await upsertPersonContact({ email: emp.email, firstName: emp.firstName, lastName: emp.lastName });
  } catch {
    return resolveGhlContactId(null, emp.email).catch(() => null);
  }
}

/**
 * Contact GHL pour le TEXTO : retrouvé/créé par le NUMÉRO de la fiche
 * TalentSecure, jamais par le courriel. Bogue du 2026-09-30 : le contact trouvé
 * par courriel portait un vieux numéro dans GHL, et le texto est parti là.
 */
async function smsContactId(emp: ClosureEmployee): Promise<string | null> {
  const byPhone = await resolveGhlContactId(emp.phone, null).catch(() => null);
  if (byPhone) return byPhone;
  return upsertPersonContact({ phone: emp.phone, firstName: emp.firstName, lastName: emp.lastName });
}

async function deliverEmail(emp: ClosureEmployee, html: string): Promise<ChannelResult> {
  if (!emp.email?.trim()) return { status: 'SKIPPED', error: 'Aucun courriel au dossier' };
  try {
    const contactId = await emailContactId(emp);
    await sendEmailWithProvider({
      to: emp.email.trim(),
      cc: [EMAIL_PAIE, EMAIL_RH],
      subject: CLOSURE_EMAIL_SUBJECT,
      html,
      replyTo: EMAIL_RH,
      contactId: contactId ?? undefined,
    });
    return { status: 'SENT', error: null };
  } catch (e) {
    return { status: 'FAILED', error: errMessage(e) };
  }
}

async function deliverSms(emp: ClosureEmployee, message: string): Promise<ChannelResult> {
  if (!emp.phone?.trim()) return { status: 'SKIPPED', error: 'Aucun téléphone au dossier' };
  if (!isGhlConfigured()) return { status: 'FAILED', error: 'GHL non configuré (texto impossible)' };
  try {
    const id = await smsContactId(emp);
    if (!id) return { status: 'FAILED', error: 'Aucun contact GHL pour ce numéro' };
    // Dernier garde-fou : GHL envoie au numéro de SA fiche. S'il ne correspond pas
    // au numéro TalentSecure, on n'envoie pas (mieux vaut « échec » qu'un inconnu).
    const contact = await getContactById(id);
    const expected = lastTenDigits(emp.phone);
    if (!contact?.phone || lastTenDigits(contact.phone) !== expected) {
      return {
        status: 'FAILED',
        error: `Le contact GHL trouvé a un autre numéro (${contact?.phone || 'aucun'}) que la fiche (${emp.phone}) — texto non envoyé`,
      };
    }
    await sendSms(id, message);
    return { status: 'SENT', error: null };
  } catch (e) {
    return { status: 'FAILED', error: errMessage(e) };
  }
}

/**
 * Ferme le dossier : statut INACTIF + date limite, propagation aux remises,
 * courriel + texto, trace. Retourne l'avis enregistré.
 */
export async function sendClosure(
  employeeId: string,
  input: ClosureInput,
  signer: ClosureSigner
): Promise<{ notice: EmployeeOffboardingNotice; becameInactive: boolean }> {
  const emp = await loadEmployee(employeeId);
  const now = new Date();
  const deadline = parseDeadline(input.deadline, now);

  // 1. Statut + ancres de fin d'emploi (même logique que PUT /employees/:id).
  const fields = buildDeactivationFields(emp, now, deadline);
  const becameInactive = emp.status === 'ACTIF';
  await prisma.employee.update({
    where: { id: employeeId },
    data: { status: 'INACTIF', ...fields },
  });
  await propagateUniformOffboarding(employeeId, deadline, emp.uniformReturnDeadlineAt);

  // 2. Contenu (figé au moment de l'envoi).
  const estimate = await estimateHoldingsCost(employeeId);
  const html = buildClosureLetterHtml({ reasonText: input.reasonText, deadline, estimate, signer, date: now });
  const smsText = buildClosureSms({
    firstName: emp.firstName,
    deadline,
    total: estimate.total,
    hasPieces: estimate.pieces.length > 0,
  });

  // 3. Envois (jamais bloquants pour la fermeture).
  const email = await deliverEmail(emp, html);
  const sms: ChannelResult = input.sendSms
    ? await deliverSms(emp, smsText)
    : { status: 'SKIPPED', error: 'Texto non demandé' };

  // 4. Trace.
  const notice = await prisma.employeeOffboardingNotice.create({
    data: {
      employeeId,
      sentById: signer.id ?? null,
      sentByName: [signer.firstName, signer.lastName].filter(Boolean).join(' ') || null,
      sentAt: now,
      reason: input.reason,
      reasonText: input.reasonText,
      returnDeadlineAt: deadline,
      emailTo: emp.email?.trim() || null,
      emailCc: [EMAIL_PAIE, EMAIL_RH],
      emailStatus: email.status,
      emailError: email.error,
      smsTo: input.sendSms ? emp.phone : null,
      smsStatus: sms.status,
      smsError: sms.error,
      estimatedAmount: estimate.total,
      piecesSnapshot: estimate.pieces as unknown as Prisma.InputJsonValue,
      htmlSnapshot: html,
    },
  });

  return { notice, becameInactive };
}

/**
 * Renvoie les canaux en échec d'un avis (même texte que l'original), après
 * correction du courriel/téléphone sur la fiche par exemple.
 */
export async function resendClosureNotice(employeeId: string, noticeId: string): Promise<EmployeeOffboardingNotice> {
  const notice = await prisma.employeeOffboardingNotice.findFirst({ where: { id: noticeId, employeeId } });
  if (!notice) throw new ApiError(404, 'Avis introuvable');
  const emp = await loadEmployee(employeeId);

  const retryEmail = notice.emailStatus !== 'SENT';
  const retrySms = notice.smsTo !== null && notice.smsStatus !== 'SENT';
  if (!retryEmail && !retrySms) throw new ApiError(400, 'Rien à renvoyer : tout est déjà parti');

  const data: Prisma.EmployeeOffboardingNoticeUpdateInput = {};
  if (retryEmail) {
    const r = await deliverEmail(emp, notice.htmlSnapshot);
    Object.assign(data, { emailTo: emp.email?.trim() || null, emailStatus: r.status, emailError: r.error });
  }
  if (retrySms) {
    const pieces = Array.isArray(notice.piecesSnapshot) ? notice.piecesSnapshot : [];
    const r = await deliverSms(
      { ...emp },
      buildClosureSms({
        firstName: emp.firstName,
        deadline: notice.returnDeadlineAt,
        total: Number(notice.estimatedAmount),
        hasPieces: pieces.length > 0,
      })
    );
    Object.assign(data, { smsTo: emp.phone, smsStatus: r.status, smsError: r.error });
  }
  return prisma.employeeOffboardingNotice.update({ where: { id: notice.id }, data });
}
