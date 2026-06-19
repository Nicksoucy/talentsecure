import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { deleteVideo, getVideoUrl, getR2SignedUrl } from './video.service';
import { useR2 } from './r2.service';

/**
 * Service centralisant la gestion des vidéos TYPÉES d'un candidat.
 *
 * Modèle : un candidat peut avoir plusieurs vidéos (table candidate_videos),
 * une par type fonctionnel : PRESENTATION (reprise du prospect), INTERVIEW
 * (vidéo d'entrevue RH), OTHER.
 *
 * Rétrocompat : les colonnes Candidate.videoUrl/videoStoragePath/videoUploadedAt
 * restent un MIROIR de la vidéo de PRESENTATION. Toutes les surfaces client
 * existantes (catalogue, marketplace, partage public) continuent ainsi de lire
 * ces colonnes sans modification, et voient la vidéo de présentation.
 */

export type CandidateVideoType = 'PRESENTATION' | 'INTERVIEW' | 'OTHER';
export const CANDIDATE_VIDEO_TYPES: CandidateVideoType[] = ['PRESENTATION', 'INTERVIEW', 'OTHER'];

/** Valide/normalise un type reçu de l'API (insensible à la casse). */
export function normalizeVideoType(raw: unknown): CandidateVideoType | null {
  if (typeof raw !== 'string') return null;
  const up = raw.trim().toUpperCase();
  return (CANDIDATE_VIDEO_TYPES as string[]).includes(up) ? (up as CandidateVideoType) : null;
}

type TxClient = Prisma.TransactionClient;

/**
 * Recalcule les colonnes miroir (video*) du candidat à partir de la vidéo de
 * PRESENTATION (ou les met à null si aucune). À appeler après toute création /
 * suppression d'une vidéo de présentation.
 */
export async function syncPresentationMirror(
  candidateId: string,
  client: TxClient | typeof prisma = prisma
): Promise<void> {
  const pres = await client.candidateVideo.findFirst({
    where: { candidateId, type: 'PRESENTATION' },
    orderBy: { videoUploadedAt: 'desc' },
  });

  await client.candidate.update({
    where: { id: candidateId },
    data: {
      videoUrl: pres?.videoUrl ?? null,
      videoStoragePath: pres?.videoStoragePath ?? null,
      videoUploadedAt: pres?.videoUploadedAt ?? null,
    },
  });
}

/**
 * Sécurité miroir : si la colonne miroir du candidat pointe vers un chemin de
 * stockage qui n'existe plus dans candidate_videos (ex. on vient de supprimer la
 * vidéo d'entrevue qui, historiquement, occupait le miroir), on resynchronise le
 * miroir sur la vidéo de PRESENTATION (ou null). Évite que les surfaces client
 * pointent vers un fichier disparu. No-op si le miroir est déjà valide.
 */
async function reconcileMirrorIfDangling(candidateId: string): Promise<void> {
  const cand = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { videoStoragePath: true },
  });
  if (!cand?.videoStoragePath) return;

  const stillReferenced = await prisma.candidateVideo.findFirst({
    where: { candidateId, videoStoragePath: cand.videoStoragePath },
    select: { id: true },
  });
  if (!stillReferenced) {
    await syncPresentationMirror(candidateId);
  }
}

/**
 * Crée une ligne CandidateVideo DANS une transaction existante (sans aucune I/O
 * de stockage). Utilisé par les chemins de conversion prospect → candidat, où la
 * vidéo de présentation pointe vers le MÊME objet de stockage que le prospect.
 * Met aussi à jour le miroir si type PRESENTATION.
 */
export async function createCandidateVideoTx(
  tx: TxClient,
  params: {
    candidateId: string;
    type: CandidateVideoType;
    videoUrl?: string | null;
    videoStoragePath?: string | null;
    videoSourceUrl?: string | null;
    videoUploadedAt?: Date | null;
    createdById?: string | null;
  }
): Promise<void> {
  await tx.candidateVideo.create({
    data: {
      candidateId: params.candidateId,
      type: params.type,
      videoUrl: params.videoUrl ?? null,
      videoStoragePath: params.videoStoragePath ?? null,
      videoSourceUrl: params.videoSourceUrl ?? null,
      videoUploadedAt: params.videoUploadedAt ?? new Date(),
      createdById: params.createdById ?? null,
    },
  });

  if (params.type === 'PRESENTATION') {
    await syncPresentationMirror(params.candidateId, tx);
  }
}

/**
 * Crée/REMPLACE la vidéo d'un type donné pour un candidat (hors transaction).
 * Supprime l'objet de stockage précédent du même type s'il diffère, puis crée la
 * nouvelle ligne. Synchronise le miroir si PRESENTATION.
 */
export async function setCandidateVideo(params: {
  candidateId: string;
  type: CandidateVideoType;
  videoStoragePath: string;
  videoUrl?: string | null;
  videoSourceUrl?: string | null;
  createdById?: string | null;
}): Promise<void> {
  const { candidateId, type, videoStoragePath } = params;

  // Remplace : supprime l'ancien objet de stockage du même type s'il diffère.
  const existing = await prisma.candidateVideo.findMany({
    where: { candidateId, type },
  });
  for (const row of existing) {
    if (row.videoStoragePath && row.videoStoragePath !== videoStoragePath) {
      try {
        await deleteVideo(row.videoStoragePath);
      } catch {
        // best-effort : on ne bloque pas si la suppression du fichier échoue
      }
    }
  }
  await prisma.candidateVideo.deleteMany({ where: { candidateId, type } });

  await prisma.candidateVideo.create({
    data: {
      candidateId,
      type,
      videoStoragePath,
      videoUrl: params.videoUrl ?? getVideoUrl(videoStoragePath),
      videoSourceUrl: params.videoSourceUrl ?? null,
      videoUploadedAt: new Date(),
      createdById: params.createdById ?? null,
    },
  });

  if (type === 'PRESENTATION') {
    await syncPresentationMirror(candidateId);
  } else {
    // Remplacement d'une vidéo non-présentation : le fichier de l'ancienne a pu
    // être supprimé ; si le miroir y pointait, on le réconcilie.
    await reconcileMirrorIfDangling(candidateId);
  }
}

/** Supprime la vidéo d'un type donné (stockage + ligne). Sync miroir si PRESENTATION. */
export async function removeCandidateVideo(
  candidateId: string,
  type: CandidateVideoType
): Promise<boolean> {
  const rows = await prisma.candidateVideo.findMany({ where: { candidateId, type } });
  if (rows.length === 0) return false;

  for (const row of rows) {
    if (row.videoStoragePath) {
      try {
        await deleteVideo(row.videoStoragePath);
      } catch {
        // best-effort
      }
    }
  }
  await prisma.candidateVideo.deleteMany({ where: { candidateId, type } });

  if (type === 'PRESENTATION') {
    await syncPresentationMirror(candidateId);
  } else {
    // Si la vidéo supprimée occupait le miroir (cas « entrevue seule »), éviter
    // un miroir orphelin pointant vers un fichier disparu.
    await reconcileMirrorIfDangling(candidateId);
  }
  return true;
}

/** Liste les vidéos d'un candidat (métadonnées, sans URL signée). */
export async function listCandidateVideos(candidateId: string) {
  const rows = await prisma.candidateVideo.findMany({
    where: { candidateId },
    orderBy: { videoUploadedAt: 'desc' },
    select: { id: true, type: true, videoUploadedAt: true, videoStoragePath: true },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    videoUploadedAt: r.videoUploadedAt,
    hasVideo: !!r.videoStoragePath,
  }));
}

/**
 * Renvoie une URL signée (lecture, 1h) pour la vidéo d'un type donné, ou null si
 * aucune vidéo / configuration invalide. Réplique la logique de détection de clé
 * R2 utilisée pour la vidéo legacy.
 */
export async function getCandidateVideoSignedUrl(
  candidateId: string,
  type: CandidateVideoType
): Promise<string | null> {
  const row = await prisma.candidateVideo.findFirst({
    where: { candidateId, type },
    orderBy: { videoUploadedAt: 'desc' },
  });
  if (!row?.videoStoragePath) return null;

  const looksLikeR2Key =
    row.videoStoragePath.startsWith('videos/') || row.videoStoragePath.includes('/candidates/');

  const url =
    useR2 || looksLikeR2Key
      ? await getR2SignedUrl(row.videoStoragePath, 3600)
      : getVideoUrl(row.videoStoragePath);

  return /^https?:\/\//i.test(url) ? url : null;
}
