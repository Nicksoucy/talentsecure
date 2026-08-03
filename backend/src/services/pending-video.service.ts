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
import { findMatchingProspect } from '../utils/candidateMatch';
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

  await prisma.pendingVideoUpload.upsert({
    where: { ghlContactId: input.ghlContactId },
    create: { ghlContactId: input.ghlContactId, ...row },
    update: row,
  });

  return claimByContact(input.ghlContactId);
}

/** Tente de rattacher l'upload d'un contact GHL au prospect correspondant. */
async function claimByContact(ghlContactId: string): Promise<ClaimResult> {
  const pending = await prisma.pendingVideoUpload.findUnique({ where: { ghlContactId } });
  if (!pending || pending.claimedAt) return { claimed: false };

  const match = await findMatchingProspect(prisma, pending.email, pending.phone);
  if (!match) return { claimed: false };

  return attach(pending.id, pending.storagePath, match.id);
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

  const result = await attach(pending.id, pending.storagePath, prospect.id, prospect.videoStoragePath);
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
      const result = await attach(pending.id, pending.storagePath, match.id);
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
 * On ne remplace JAMAIS une vidéo déjà présente sur le prospect. L'upload est
 * quand même marqué réclamé : on sait à qui il appartient, donc il n'a rien à
 * faire dans la liste des orphelins (qui doit rester « on ignore le
 * propriétaire »). Le fichier reste dans R2 et la ligne garde sa trace.
 */
async function attach(
  pendingId: string,
  storagePath: string,
  prospectId: string,
  knownExistingPath?: string | null
): Promise<ClaimResult> {
  const existingPath =
    knownExistingPath !== undefined
      ? knownExistingPath
      : (
          await prisma.prospectCandidate.findUnique({
            where: { id: prospectId },
            select: { videoStoragePath: true },
          })
        )?.videoStoragePath ?? null;

  const superseded = Boolean(existingPath) && existingPath !== storagePath;

  await prisma.$transaction(async (tx) => {
    if (!superseded) {
      await tx.prospectCandidate.update({
        where: { id: prospectId },
        data: { videoStoragePath: storagePath, videoUploadedAt: new Date() },
      });
    }
    await tx.pendingVideoUpload.update({
      where: { id: pendingId },
      data: { claimedByProspectId: prospectId, claimedAt: new Date() },
    });
  });

  if (superseded) {
    logger.warn('Vidéo publique reçue mais le prospect en avait déjà une — conservée telle quelle', {
      prospectId,
      pendingId,
    });
  } else {
    logger.info('Vidéo publique rattachée au prospect', { prospectId, storagePath });
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
