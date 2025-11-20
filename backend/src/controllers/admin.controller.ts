import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';

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
      return res.status(403).json({
        error: 'Accès refusé: seuls les administrateurs peuvent exécuter cette action',
      });
    }

    console.log('🔍 Recherche des candidats auto-convertis...');

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

    console.log(`✅ Trouvé ${autoConvertedCandidates.length} candidat(s) auto-converti(s)`);

    const results = [];

    for (const candidate of autoConvertedCandidates) {
      console.log(`\n📝 Traitement: ${candidate.firstName} ${candidate.lastName}`);

      try {
        // 1. Vérifier si un prospect avec cet ID existe déjà
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

          // Supprimer le candidat (soft delete)
          await prisma.candidate.update({
            where: { id: candidate.id },
            data: {
              isDeleted: true,
              deletedAt: new Date(),
            },
          });

          results.push({
            name: `${candidate.firstName} ${candidate.lastName}`,
            action: 'prospect_restored',
            prospectId: existingProspect.id,
            candidateId: candidate.id,
          });
        } else {
          // 2. Créer un nouveau prospect avec les données du candidat
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

          // 3. Supprimer le candidat (soft delete)
          await prisma.candidate.update({
            where: { id: candidate.id },
            data: {
              isDeleted: true,
              deletedAt: new Date(),
            },
          });

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
      return res.status(403).json({
        error: 'Accès refusé: seuls les administrateurs peuvent exécuter cette action',
      });
    }

    const { id } = req.params;

    // Récupérer le candidat
    const candidate = await prisma.candidate.findUnique({
      where: { id },
    });

    if (!candidate || candidate.isDeleted) {
      return res.status(404).json({
        error: 'Candidat non trouvé',
      });
    }

    console.log(`📝 Re-conversion du candidat: ${candidate.firstName} ${candidate.lastName}`);

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
      return res.status(403).json({
        error: 'Accès refusé: seuls les administrateurs peuvent exécuter cette action',
      });
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
