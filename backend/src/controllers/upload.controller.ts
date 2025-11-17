import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import path from 'path';
import fs from 'fs';
import { deleteFile } from '../middleware/upload';
import { processCVUpload, deleteCV, getCVSignedUrl, getLocalCVPath, useR2 } from '../services/cv.service';

/**
 * Upload CV for a candidate
 */
export const uploadCandidateCV = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    // Vérifier que le candidat existe
    const candidate = await prisma.candidate.findUnique({
      where: { id },
    });

    if (!candidate || candidate.isDeleted) {
      // Supprimer le fichier uploadé si le candidat n'existe pas
      await deleteFile(req.file.path);
      return res.status(404).json({ error: 'Candidat non trouvé' });
    }

    // Supprimer l'ancien CV s'il existe
    if (candidate.cvStoragePath) {
      await deleteCV(candidate.cvStoragePath).catch(() => {});
    }

    // Upload to R2 (or local storage if R2 is disabled)
    const cvStoragePath = await processCVUpload(req.file.path, req.file.originalname);
    const cvUrl = `/api/candidates/${id}/cv/download`;

    const updatedCandidate = await prisma.candidate.update({
      where: { id },
      data: {
        cvUrl,
        cvStoragePath,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE',
        resource: 'Candidate',
        resourceId: id,
        details: `CV uploadé pour ${candidate.firstName} ${candidate.lastName}`,
      },
    });

    res.json({
      message: 'CV uploadé avec succès',
      data: {
        cvUrl: updatedCandidate.cvUrl,
        filename: req.file.filename,
      },
    });
  } catch (error) {
    // En cas d'erreur, supprimer le fichier uploadé
    if (req.file) {
      await deleteFile(req.file.path).catch(() => {});
    }
    next(error);
  }
};

/**
 * Download CV for a candidate
 */
export const downloadCandidateCV = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const candidate = await prisma.candidate.findUnique({
      where: { id },
      select: { cvStoragePath: true, firstName: true, lastName: true, isDeleted: true },
    });

    if (!candidate || candidate.isDeleted || !candidate.cvStoragePath) {
      return res.status(404).json({ error: 'CV non trouvé' });
    }

    if (useR2) {
      // Generate signed URL for R2
      const signedUrl = await getCVSignedUrl(candidate.cvStoragePath, 3600);

      // Redirect to the signed URL
      return res.redirect(signedUrl);
    } else {
      // Local storage
      const filePath = getLocalCVPath(candidate.cvStoragePath);

      // Vérifier que le fichier existe
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Fichier CV introuvable' });
      }

      // Envoyer le fichier
      const filename = `CV_${candidate.firstName}_${candidate.lastName}${path.extname(filePath)}`;
      res.download(filePath, filename);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Delete CV for a candidate
 */
export const deleteCandidateCV = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const candidate = await prisma.candidate.findUnique({
      where: { id },
      select: { cvStoragePath: true, firstName: true, lastName: true, isDeleted: true },
    });

    if (!candidate || candidate.isDeleted) {
      return res.status(404).json({ error: 'Candidat non trouvé' });
    }

    if (!candidate.cvStoragePath) {
      return res.status(404).json({ error: 'Aucun CV à supprimer' });
    }

    // Supprimer le fichier (R2 ou local)
    await deleteCV(candidate.cvStoragePath);

    // Mettre à jour le candidat
    await prisma.candidate.update({
      where: { id },
      data: {
        cvUrl: null,
        cvStoragePath: null,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'DELETE',
        resource: 'Candidate',
        resourceId: id,
        details: `CV supprimé pour ${candidate.firstName} ${candidate.lastName}`,
      },
    });

    res.json({ message: 'CV supprimé avec succès' });
  } catch (error) {
    next(error);
  }
};
