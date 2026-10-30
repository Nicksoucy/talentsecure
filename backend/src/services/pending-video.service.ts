/**
 * Rattachement des vidéos téléversées sur la page publique /ma-video.
 *
 * Le problème résolu ici : la redirection du formulaire GHL est instantanée,
 * alors que le webhook qui crée le `ProspectCandidate` arrive après. Le candidat
 * peut donc terminer son téléversement AVANT que sa fiche existe.
 *
 * L'upload est donc d'abord garé dans `pending_video_uploads`, puis « réclamé »
 * dès qu'un prospect correspondant apparaît — à trois moments :
 *   1. immédiatement (le prospect existait déjà),
 *   2. à la création du prospect (webhook, synchro survey),
 *   3. par balayage cron, filet pour tout ce qui a raté 1 et 2.
 */

import { prisma } from '../config/database';
import {
  findMatchingCandidate,
  findMatchingEmployee,
  findMatchingProspect,
} from '../utils/candidateMatch';
import { setCandidateVideo } from './candidate-video.service';
import { lastTenDigits } from '../utils/phone';
import logger from '../config/logger';

export interface RecordUploadInput {
  ghlContactId: string;
  email?: string | null;
  phone?: string | null;
  storagePath: string;
  originalName?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
}

export interface ClaimResult {
  claimed: boolean;
  prospectId?: string;
  /** True quand le prospect avait déjà une vidéo : la sienne est conservée. */
  supersededByExisting?: boolean;
}

/**
 * Enregistre un téléversement terminé et tente de le rattacher tout de suite.
 *
 * Upsert sur `ghlContactId` : si le candidat refait sa vidéo, la nouvelle
 * remplace l'ancienne au lieu d'empiler des orphelins.
 */
export async function recordUpload(input: RecordUploadInput): Promise<ClaimResult> {
  await upsertPending(input);
  return claimByContact(input.ghlContactId);
}

/** Gare (ou remplace) l'upload d'un contact, non réclamé. */
async function upsertPending(input: RecordUploadInput) {
  const email = input.email?.trim() || null;
  const phone = input.phone?.trim() || null;

  const row = {
    email,
    phone,
    storagePath: input.storagePath,
    originalName: input.originalName || null,
    contentType: input.contentType || null,
    sizeBytes: input.sizeBytes ?? null,
    claimedByProspectId: null,
    claimedAt: null,
  };

  return prisma.pendingVideoUpload.upsert({
    where: { ghlContactId: input.ghlContactId },
    create: { ghlContactId: input.ghlContactId, ...row },
    update: row,
  });
}

/** Tente de rattacher l'upload d'un contact GHL au prospect correspondant. */
async function claimByContact(ghlContactId: string): Promise<ClaimResult> {
  const pending = await prisma.pendingVideoUpload.findUnique({ where: { ghlContactId } });
  if (!pending || pending.claimedAt) return { claimed: false };

  const match = await findMatchingProspect(prisma, pending.email, pending.phone);
  if (!match) return { claimed: false };

  return attach(pending, match.id);
}

/**
 * Rattache un upload en attente à un prospect qui vient d'être créé.
 * Best-effort : l'appelant ne doit jamais échouer à cause de cette étape.
 *
 * Retourne l'id de l'upload réclamé, ou null si rien ne correspondait.
 */
export async function claimForProspect(prospect: {
  id: string;
  email?: string | null;
  phone?: string | null;
  videoStoragePath?: string | null;
}): Promise<string | null> {
  const pending = await findUnclaimedFor(prospect.email, prospect.phone);
  if (!pending) return null;

  const result = await attach(pending, prospect.id);
  return result.claimed ? pending.id : null;
}

/**
 * Rejoue le rattachement pour tous les uploads encore en attente.
 * Filet pour les cas où le webhook est arrivé en retard, ou pas du tout.
 */
export async function sweepUnclaimed(): Promise<{ scanned: number; claimed: number }> {
  const pendings = await prisma.pendingVideoUpload.findMany({
    where: { claimedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  let claimed = 0;
  for (const pending of pendings) {
    try {
      const match = await findMatchingProspect(prisma, pending.email, pending.phone);
      if (!match) continue;
      const result = await attach(pending, match.id);
      if (result.claimed) claimed++;
    } catch (e: any) {
      logger.error('Balayage vidéos en attente : échec sur un upload', {
        pendingId: pending.id,
        error: e?.message,
      });
    }
  }

  if (claimed > 0) {
    logger.info(`Balayage vidéos en attente : ${claimed}/${pendings.length} rattachée(s)`);
  }
  return { scanned: pendings.length, claimed };
}

/**
 * Écrit la vidéo sur le prospect et marque l'upload comme réclamé.
 *
 * La vidéo la plus RÉCENTE gagne : un candidat qui renvoie une vidéo nous dit
 * que quelque chose a changé. Elle remplace donc l'ancienne, et la date de
 * soumission est rafraîchie pour que la fiche remonte en tête de liste.
 * L'ancien fichier reste dans R2 : on ne jette rien sur un simple renvoi.
 *
 * Seule exception : la fiche porte déjà une vidéo PLUS récente que cet upload
 * (un upload resté en attente puis réclamé tard par le balayage, par exemple).
 * Celle de la fiche est alors conservée. L'upload est quand même marqué
 * réclamé : on sait à qui il appartient, donc il n'a rien à faire dans la liste
 * des orphelins (qui doit rester « on ignore le propriétaire »).
 *
 * La date de l'upload est `updatedAt` et non `createdAt` : un renvoi du même
 * contact met à jour la ligne existante (upsert), `createdAt` resterait figé
 * sur le premier envoi.
 */
async function attach(
  pending: { id: string; storagePath: string; updatedAt: Date },
  prospectId: string
): Promise<ClaimResult> {
  const uploadedAt = pending.updatedAt;
  const prospect = await prisma.prospectCandidate.findUnique({
    where: { id: prospectId },
    select: { videoStoragePath: true, videoUploadedAt: true, submissionDate: true },
  });

  const superseded =
    Boolean(prospect?.videoStoragePath) &&
    prospect?.videoStoragePath !== pending.storagePath &&
    Boolean(prospect?.videoUploadedAt) &&
    (prospect?.videoUploadedAt as Date) > uploadedAt;

  const refreshSubmission = !prospect?.submissionDate || prospect.submissionDate < uploadedAt;

  await prisma.$transaction(async (tx) => {
    if (!superseded) {
      await tx.prospectCandidate.update({
        where: { id: prospectId },
        data: {
          videoStoragePath: pending.storagePath,
          videoUploadedAt: uploadedAt,
          ...(refreshSubmission ? { submissionDate: uploadedAt } : {}),
        },
      });
    }
    await tx.pendingVideoUpload.update({
      where: { id: pending.id },
      data: { claimedByProspectId: prospectId, claimedAt: new Date() },
    });
  });

  if (superseded) {
    logger.warn('Vidéo publique plus ancienne que celle de la fiche — fiche conservée telle quelle', {
      prospectId,
      pendingId: pending.id,
    });
  } else {
    logger.info('Vidéo publique rattachée au prospect', {
      prospectId,
      storagePath: pending.storagePath,
      replaced: Boolean(prospect?.videoStoragePath && prospect.videoStoragePath !== pending.storagePath),
    });
  }

  return { claimed: true, prospectId, supersededByExisting: superseded };
}

/**
 * Cherche un upload non réclamé correspondant à un courriel ou un téléphone.
 *
 * Le téléphone est comparé en exact PUIS sur les 10 derniers chiffres — GHL
 * stocke en E.164 (+15145551234) alors que le webhook peut livrer
 * « 514-555-1234 ». Même logique que utils/candidateMatch.
 */
async function findUnclaimedFor(email?: string | null, phone?: string | null) {
  const cleanEmail = (email || '').trim();
  const cleanPhone = (phone || '').trim();

  const or: any[] = [];
  if (cleanEmail) or.push({ email: { equals: cleanEmail, mode: 'insensitive' as const } });
  if (cleanPhone) or.push({ phone: cleanPhone });
  if (or.length === 0) return null;

  const exact = await prisma.pendingVideoUpload.findFirst({
    where: { claimedAt: null, OR: or },
    orderBy: { createdAt: 'desc' },
  });
  if (exact) return exact;

  const digits = lastTenDigits(cleanPhone);
  if (digits.length !== 10) return null;

  // Table volumétriquement petite (uploads non réclamés en cours) : fetch OK.
  const unclaimed = await prisma.pendingVideoUpload.findMany({
    where: { claimedAt: null, phone: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  return unclaimed.find((p) => lastTenDigits(p.phone || '') === digits) || null;
}

/** Uploads jamais réclamés depuis plus de `minAgeMinutes` — pour l'écran staff. */
export async function listOrphanUploads(minAgeMinutes: number = 60) {
  const cutoff = new Date(Date.now() - minAgeMinutes * 60_000);
  return prisma.pendingVideoUpload.findMany({
    where: { claimedAt: null, createdAt: { lt: cutoff } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

// ── Lien général (/video) ───────────────────────────────────────────────────

export interface OpenUploadInput extends RecordUploadInput {
  firstName: string;
  lastName: string;
}

export type OpenFilingOutcome =
  | 'active-employee'
  | 'candidate'
  | 'prospect'
  | 'former-employee'
  | 'new-prospect';

export interface OpenFilingResult {
  outcome: OpenFilingOutcome;
  /** Fiche qui a reçu la vidéo (candidat ou prospect) ; absente pour un employé actif. */
  recordId?: string;
}

/**
 * Range une vidéo reçue par le lien général. Contrairement à /ma-video, il n'y
 * a pas de webhook GHL derrière : c'est ici qu'on décide où va la personne.
 *
 *   1. Employé ACTIF → rien n'est créé ; la vidéo reste dans les non rattachées.
 *   2. Candidat → elle devient sa vidéo de présentation (la précédente est
 *      remplacée, son fichier conservé). Pas de doublon dans Candidats potentiels.
 *   3. Candidat potentiel → la vidéo va sur sa fiche (voir `attach`).
 *   4. Ancien employé (INACTIF) → nouvelle fiche Candidat potentiel, avec une
 *      note qui le signale pour que le recruteur le sache avant de rappeler.
 *   5. Personne nulle part → nouvelle fiche Candidat potentiel.
 */
export async function fileOpenUpload(input: OpenUploadInput): Promise<OpenFilingResult> {
  const pending = await upsertPending(input);
  const { email, phone } = pending;

  const activeEmployee = await findMatchingEmployee(prisma, email, phone, { status: 'ACTIF' });
  if (activeEmployee) {
    logger.info('Vidéo du lien général : employé actif, laissée dans les non rattachées', {
      employeeId: activeEmployee.id,
    });
    return { outcome: 'active-employee' };
  }

  const candidate = await findMatchingCandidate(prisma, email, phone);
  if (candidate) {
    await setCandidateVideo({
      candidateId: candidate.id,
      type: 'PRESENTATION',
      videoStoragePath: pending.storagePath,
      keepPreviousFile: true,
    });
    // `claimedByProspectId` reste vide : la colonne ne vise que les prospects.
    // `claimedAt` suffit à sortir l'upload de la liste des orphelins.
    await prisma.pendingVideoUpload.update({
      where: { id: pending.id },
      data: { claimedAt: new Date() },
    });
    logger.info('Vidéo du lien général posée sur le candidat', { candidateId: candidate.id });
    return { outcome: 'candidate', recordId: candidate.id };
  }

  const prospect = await findMatchingProspect(prisma, email, phone);
  if (prospect) {
    await attach(pending, prospect.id);
    return { outcome: 'prospect', recordId: prospect.id };
  }

  const formerEmployee = await findMatchingEmployee(prisma, email, phone);
  const created = await prisma.prospectCandidate.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email,
      phone: phone || '',
      source: 'lien-video',
      submissionDate: pending.updatedAt,
      notes: formerEmployee
        ? `Ancien employé — voir sa fiche employé (${formerEmployee.firstName} ${formerEmployee.lastName}). ` +
          'Ajouté par le lien vidéo général (/video).'
        : 'Ajouté par le lien vidéo général (/video)',
    },
  });
  await attach(pending, created.id);
  return { outcome: formerEmployee ? 'former-employee' : 'new-prospect', recordId: created.id };
}
