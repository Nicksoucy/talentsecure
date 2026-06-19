import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import logger from '../config/logger';
import { invalidateCaches } from '../utils/cacheInvalidation';
import { processVideoUpload, getUploadSignedUrl } from '../services/video.service';
import {
  normalizeVideoType,
  setCandidateVideo,
  removeCandidateVideo,
  listCandidateVideos,
  getCandidateVideoSignedUrl,
  CandidateVideoType,
} from '../services/candidate-video.service';

const invalidateCandidateCaches = () =>
  invalidateCaches({
    listPrefix: 'candidates:list',
    statKeys: ['candidates:stats', 'candidates:city-stats', 'candidates:map-points'],
  });

async function candidateExists(id: string): Promise<boolean> {
  const c = await prisma.candidate.findUnique({ where: { id }, select: { id: true } });
  return !!c;
}

/** Lit et valide le param :type ; répond 400 et renvoie null si invalide. */
function parseType(req: Request, res: Response): CandidateVideoType | null {
  const type = normalizeVideoType(req.params.type);
  if (!type) {
    res.status(400).json({
      success: false,
      error: 'Type de vidéo invalide (PRESENTATION | INTERVIEW | OTHER)',
    });
    return null;
  }
  return type;
}

function currentUserId(req: Request): string | null {
  return (req as any).user?.id ?? null;
}

/**
 * GET /api/candidates/:id/videos
 * Liste des vidéos typées (métadonnées) d'un candidat.
 */
export const getCandidateVideos = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!(await candidateExists(id))) {
      return res.status(404).json({ success: false, error: 'Candidat non trouvé' });
    }
    const videos = await listCandidateVideos(id);
    res.json({ success: true, data: videos });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/candidates/:id/videos/:type/url
 * URL signée (lecture, 1h) pour la vidéo d'un type donné.
 */
export const getCandidateVideoUrlByType = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const type = parseType(req, res);
    if (!type) return;

    const videoUrl = await getCandidateVideoSignedUrl(id, type);
    if (!videoUrl) {
      return res.status(404).json({ success: false, error: 'Vidéo non trouvée' });
    }
    res.json({ success: true, data: { videoUrl, expiresIn: 3600 } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/candidates/:id/videos/:type/initiate-upload
 * Renvoie une URL signée pour l'upload direct (R2/GCS).
 */
export const initiateCandidateVideoUpload = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { filename, contentType } = req.body;
    const type = parseType(req, res);
    if (!type) return;

    if (!filename || !contentType) {
      return res.status(400).json({ success: false, error: 'Filename and content type are required' });
    }
    if (!(await candidateExists(id))) {
      return res.status(404).json({ success: false, error: 'Candidat non trouvé' });
    }

    try {
      const { signedUrl, key, provider } = await getUploadSignedUrl(filename, contentType);
      res.json({ success: true, data: { signedUrl, key, provider, expiresIn: 3600 } });
    } catch (err: any) {
      if (err.message?.includes('not supported')) {
        return res.status(400).json({
          success: false,
          error: 'DIRECT_UPLOAD_NOT_SUPPORTED',
          message: err.message,
        });
      }
      throw err;
    }
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/candidates/:id/videos/:type/complete-upload
 * Confirme un upload direct : enregistre/remplace la vidéo de ce type.
 */
export const completeCandidateVideoUpload = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { key } = req.body;
    const type = parseType(req, res);
    if (!type) return;

    if (!key) {
      return res.status(400).json({ success: false, error: 'Storage key is required' });
    }
    if (!(await candidateExists(id))) {
      return res.status(404).json({ success: false, error: 'Candidat non trouvé' });
    }

    await setCandidateVideo({
      candidateId: id,
      type,
      videoStoragePath: key,
      createdById: currentUserId(req),
    });
    await invalidateCandidateCaches();

    res.json({ success: true, message: 'Vidéo confirmée avec succès', data: { type } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/candidates/:id/videos/:type   (multipart, champ "video")
 * Upload multipart de secours (Local/Drive sans upload direct).
 */
export const uploadCandidateVideoByType = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const type = parseType(req, res);
    if (!type) return;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Aucune vidéo fournie' });
    }
    if (!(await candidateExists(id))) {
      return res.status(404).json({ success: false, error: 'Candidat non trouvé' });
    }

    const key = await processVideoUpload(req.file.path, req.file.originalname);
    await setCandidateVideo({
      candidateId: id,
      type,
      videoStoragePath: key,
      createdById: currentUserId(req),
    });
    await invalidateCandidateCaches();

    res.json({ success: true, message: 'Vidéo uploadée avec succès', data: { type } });
  } catch (error: any) {
    logger.error('Error uploading typed candidate video', { error });
    next(error);
  }
};

/**
 * DELETE /api/candidates/:id/videos/:type
 * Supprime la vidéo d'un type donné (stockage + ligne).
 */
export const deleteCandidateVideoByType = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const type = parseType(req, res);
    if (!type) return;

    if (!(await candidateExists(id))) {
      return res.status(404).json({ success: false, error: 'Candidat non trouvé' });
    }

    const removed = await removeCandidateVideo(id, type);
    if (!removed) {
      return res.status(404).json({ success: false, error: 'Aucune vidéo trouvée pour ce type' });
    }
    await invalidateCandidateCaches();

    res.json({ success: true, message: 'Vidéo supprimée avec succès' });
  } catch (error) {
    logger.error('Error deleting typed candidate video', { error });
    next(error);
  }
};
