import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import logger from '../config/logger';
import { ApiError } from '../utils/apiError';

/**
 * ADMIN ONLY: Re-convertir les candidats auto-convertis en prospects
 *
 * Cette fonction identifie et re-convertit en prospects tous les candidats
 * qui ont été automatiquement créés par l'IA (détecté via hrNotes).
 */
export const revertAutoConvertedCandidates = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // SÉCURITÉ: Vérifier que l'utilisateur est admin
    if (req.user?.role !== 'ADMIN') {
      throw new ApiError(403, 'Accès refusé: seuls les administrateurs peuvent exécuter cette action');
    }

    logger.info('Admin: searching for auto-converted candidates');

    // Trouver tous les candidats avec "Auto-Converti" dans hrNotes
    const autoConvertedCandidates = await prisma.candidate.findMany({
      where: {
        hrNotes: {
          contains: 'Auto-Converti',
          mode: 'insensitive',
        },
        isDeleted: false,
      },
    });

    logger.info('Admin: auto-converted candidates found', { count: autoConvertedCandidates.length });

    const results = [];

    // O8 — pré-charge les prospects une seule fois (évite un findFirst par
    // candidat = N+1). On matche en mémoire ; les nouveaux prospects créés sont
    // ajoutés au cache pour que les candidats suivants les retrouvent (même
    // comportement que les requêtes live d'origine).
    const prospectCache = await prisma.prospectCandidate.findMany({
      where: { isDeleted: false },
      select: { id: true, convertedToId: true, email: true, phone: true, isConverted: true },
    });
    const findExistingProspect = (candidate: { id: string; email: string | null; phone: string }) => {
      const email = (candidate.email || '').toLowerCase();
      return (
        prospectCache.find(
          (p) =>
            p.convertedToId === candidate.id ||
            (email && (p.email || '').toLowerCase() === email) ||
            p.phone === candidate.phone
        ) || null
      );
    };

    // Mutations regroupées (batch) au lieu d'un update par candidat.
    const candidatesToDelete: string[] = [];
    const prospectsToDeconvert: string[] = [];

    for (const candidate of autoConvertedCandidates) {
      try {
        const existingProspect = findExistingProspect(candidate);

        if (existingProspect) {
          if (existingProspect.isConverted) {
            prospectsToDeconvert.push(existingProspect.id);
            existingProspect.isConverted = false; // reflète le batch à venir
          }
          candidatesToDelete.push(candidate.id);
          results.push({
            name: `${candidate.firstName} ${candidate.lastName}`,
            action: 'prospect_restored',
            prospectId: existingProspect.id,
            candidateId: candidate.id,
          });
        } else {
          const newProspect = await prisma.prospectCandidate.create({
            data: {
              firstName: candidate.firstName,
              lastName: candidate.lastName,
              email: candidate.email,
              phone: candidate.phone,
              fullAddress: candidate.address,
              city: candidate.city,
              province: candidate.province,
              postalCode: candidate.postalCode,
              cvUrl: candidate.cvUrl,
              cvStoragePath: candidate.cvStoragePath,
              isContacted: false,
              isConverted: false,
              notes: `Re-créé depuis candidat auto-converti (ID original: ${candidate.id})`,
            },
          });
          // Visible pour les candidats suivants (évite les doublons même contact).
          prospectCache.push({
            id: newProspect.id,
            convertedToId: newProspect.convertedToId,
            email: newProspect.email,
            phone: newProspect.phone,
            isConverted: newProspect.isConverted,
          });
          candidatesToDelete.push(candidate.id);
          results.push({
            name: `${candidate.firstName} ${candidate.lastName}`,
            action: 'prospect_created',
            prospectId: newProspect.id,
            candidateId: candidate.id,
          });
        }
      } catch (error: any) {
        results.push({
          name: `${candidate.firstName} ${candidate.lastName}`,
          action: 'error',
          error: error.message,
        });
      }
    }

    // Applique les mutations en lot (2 requêtes au lieu de ~2N).
    if (prospectsToDeconvert.length > 0) {
      await prisma.prospectCandidate.updateMany({
        where: { id: { in: prospectsToDeconvert } },
        data: { isConverted: false, convertedAt: null, convertedToId: null },
      });
    }
    if (candidatesToDelete.length > 0) {
      await prisma.candidate.updateMany({
        where: { id: { in: candidatesToDelete } },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    }

    // Log d'audit
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'UPDATE',
        resource: 'Candidate',
        details: `Re-converti ${results.length} candidat(s) auto-converti(s) en prospects`,
      },
    });

    res.json({
      success: true,
      message: `${results.length} candidat(s) traité(s)`,
      results,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ADMIN ONLY: Re-convertir UN SEUL candidat en prospect
 * Utilisé depuis le menu "3 points" dans la liste des candidats
 */
export const revertSingleCandidateToProspect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // SÉCURITÉ: Vérifier que l'utilisateur est admin
    if (req.user?.role !== 'ADMIN') {
      throw new ApiError(403, 'Accès refusé: seuls les administrateurs peuvent exécuter cette action');
    }

    const { id } = req.params;

    // Récupérer le candidat
    const candidate = await prisma.candidate.findUnique({
      where: { id },
    });

    if (!candidate || candidate.isDeleted) {
      throw new ApiError(404, 'Candidat non trouvé');
    }

    logger.info('Admin: reverting single candidate', {
      candidateId: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
    });

    // Vérifier si un prospect existe déjà
    const existingProspect = await prisma.prospectCandidate.findFirst({
      where: {
        OR: [
          { convertedToId: candidate.id },
          { email: candidate.email || undefined },
          { phone: candidate.phone },
        ],
        isDeleted: false,
      },
    });

    let prospectId: string;

    if (existingProspect) {
      // Si le prospect était marqué comme converti, le dé-convertir
      if (existingProspect.isConverted) {
        await prisma.prospectCandidate.update({
          where: { id: existingProspect.id },
          data: {
            isConverted: false,
            convertedAt: null,
            convertedToId: null,
          },
        });
      }
      prospectId = existingProspect.id;
    } else {
      // Créer un nouveau prospect avec TOUTES les données du candidat
      const newProspect = await prisma.prospectCandidate.create({
        data: {
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          phone: candidate.phone,
          fullAddress: candidate.address,
          city: candidate.city,
          province: candidate.province,
          postalCode: candidate.postalCode,
          cvUrl: candidate.cvUrl, // ✅ PRÉSERVÉ
          cvStoragePath: candidate.cvStoragePath, // ✅ PRÉSERVÉ
          isContacted: false,
          isConverted: false,
          notes: `Re-créé depuis candidat (ID: ${candidate.id})\nRaison: Re-conversion manuelle par admin`,
        },
      });
      prospectId = newProspect.id;
    }

    // Supprimer le candidat (soft delete)
    await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    // Log d'audit
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'UPDATE',
        resource: 'Candidate',
        resourceId: candidate.id,
        details: `Candidat re-converti en prospect: ${candidate.firstName} ${candidate.lastName} (nouveau prospect ID: ${prospectId})`,
      },
    });

    res.json({
      success: true,
      message: `${candidate.firstName} ${candidate.lastName} a été re-converti en candidat potentiel avec succès`,
      prospectId,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ADMIN ONLY: Trouver tous les candidats auto-convertis (sans les modifier)
 */
export const findAutoConvertedCandidates = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // SÉCURITÉ: Vérifier que l'utilisateur est admin
    if (req.user?.role !== 'ADMIN') {
      throw new ApiError(403, 'Accès refusé: seuls les administrateurs peuvent exécuter cette action');
    }

    const autoConvertedCandidates = await prisma.candidate.findMany({
      where: {
        hrNotes: {
          contains: 'Auto-Converti',
          mode: 'insensitive',
        },
        isDeleted: false,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        city: true,
        hrNotes: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      count: autoConvertedCandidates.length,
      candidates: autoConvertedCandidates,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ADMIN ONLY: Re-convertir PLUSIEURS candidats en prospects (Batch)
 */
export const revertBatchCandidatesToProspects = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // SÉCURITÉ: Vérifier que l'utilisateur est admin
    if (req.user?.role !== 'ADMIN') {
      throw new ApiError(403, 'Accès refusé: seuls les administrateurs peuvent exécuter cette action');
    }

    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(400, 'Liste d\'IDs invalide ou vide');
    }

    logger.info('Admin: reverting batch of candidates', { count: ids.length });

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const id of ids) {
      try {
        // Récupérer le candidat
        const candidate = await prisma.candidate.findUnique({
          where: { id },
        });

        if (!candidate || candidate.isDeleted) {
          results.push({ id, status: 'error', message: 'Candidat non trouvé ou déjà supprimé' });
          errorCount++;
          continue;
        }

        // Vérifier si un prospect existe déjà
        const existingProspect = await prisma.prospectCandidate.findFirst({
          where: {
            OR: [
              { convertedToId: candidate.id },
              { email: candidate.email || undefined },
              { phone: candidate.phone },
            ],
            isDeleted: false,
          },
        });

        let prospectId: string;

        if (existingProspect) {
          // Si le prospect était marqué comme converti, le dé-convertir
          if (existingProspect.isConverted) {
            await prisma.prospectCandidate.update({
              where: { id: existingProspect.id },
              data: {
                isConverted: false,
                convertedAt: null,
                convertedToId: null,
              },
            });
          }
          prospectId = existingProspect.id;
        } else {
          // Créer un nouveau prospect avec TOUTES les données du candidat
          const newProspect = await prisma.prospectCandidate.create({
            data: {
              firstName: candidate.firstName,
              lastName: candidate.lastName,
              email: candidate.email,
              phone: candidate.phone,
              fullAddress: candidate.address,
              city: candidate.city,
              province: candidate.province,
              postalCode: candidate.postalCode,
              cvUrl: candidate.cvUrl,
              cvStoragePath: candidate.cvStoragePath,
              isContacted: false,
              isConverted: false,
              notes: `Re-créé depuis candidat (ID: ${candidate.id})\nRaison: Re-conversion batch par admin`,
            },
          });
          prospectId = newProspect.id;
        }

        // Supprimer le candidat (soft delete)
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            isDeleted: true,
            deletedAt: new Date(),
          },
        });

        results.push({ id, status: 'success', prospectId, name: `${candidate.firstName} ${candidate.lastName}` });
        successCount++;

      } catch (error: any) {
        logger.error('Admin: failed to revert candidate', {
          candidateId: id,
          error: error instanceof Error ? error.message : String(error),
        });
        results.push({ id, status: 'error', message: error.message });
        errorCount++;
      }
    }

    // Log d'audit global
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'UPDATE',
        resource: 'Candidate',
        details: `Batch re-conversion: ${successCount} succès, ${errorCount} erreurs`,
      },
    });

    res.json({
      success: true,
      message: `${successCount} candidat(s) re-converti(s) avec succès`,
      results,
    });
  } catch (error) {
    next(error);
  }
};
