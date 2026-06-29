import { Request, Response, NextFunction } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { PDFService } from '../services/pdf.service';
import { useR2, getSignedFileUrl } from '../services/r2.service';
import { prisma } from '../config/database';
import { getCache, setCache } from '../config/cache';
import { buildCacheKey } from '../utils/cache';
import { invalidateCaches } from '../utils/cacheInvalidation';
import logger from '../config/logger';
import { ApiError } from '../utils/apiError';

const CATALOGUE_LIST_CACHE_PREFIX = 'catalogues:list';
const CATALOGUE_DETAIL_CACHE_PREFIX = 'catalogues:detail';

const invalidateCatalogueCaches = (catalogueId?: string) =>
  invalidateCaches({
    listPrefix: CATALOGUE_LIST_CACHE_PREFIX,
    detailPrefix: CATALOGUE_DETAIL_CACHE_PREFIX,
    detailId: catalogueId,
  });

/**
 * Get all catalogues with filters
 */
export const getCatalogues = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      page = '1',
      limit = '20',
      status,
      clientId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;
    const cacheKey = buildCacheKey(CATALOGUE_LIST_CACHE_PREFIX, req.query);
    const cachedResponse = await getCache<{ data: any; pagination: any }>(cacheKey);

    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    // Build filters
    const where: any = {};
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;

    // Get catalogues
    const [catalogues, total] = await Promise.all([
      prisma.catalogue.findMany({
        where,
        include: {
          client: true,
          createdBy: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          items: {
            include: {
              candidate: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  status: true,
                  globalRating: true,
                  cvUrl: true,
                  cvStoragePath: true,
                },
              },
            },
            orderBy: {
              order: 'asc',
            },
          },
        },
        orderBy: {
          [sortBy as string]: sortOrder,
        },
        skip,
        take: limitNum,
      }),
      prisma.catalogue.count({ where }),
    ]);

    const responsePayload = {
      data: catalogues,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };

    await setCache(cacheKey, responsePayload, 300);

    res.json(responsePayload);
  } catch (error) {
    next(error);
  }
};

/**
 * Get single catalogue by ID
 */
export const getCatalogueById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const cacheKey = `${CATALOGUE_DETAIL_CACHE_PREFIX}:${id}`;
    const cachedCatalogue = await getCache<{ data: any }>(cacheKey);
    if (cachedCatalogue) {
      return res.json(cachedCatalogue);
    }

    const catalogue = await prisma.catalogue.findUnique({
      where: { id },
      include: {
        client: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          include: {
            candidate: {
              include: {
                languages: true,
                experiences: true,
                availabilities: true,
                certifications: true,
              },
            },
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    if (!catalogue) {
      throw new ApiError(404, 'Catalogue non trouvé');
    }

    await setCache(cacheKey, catalogue, 300);

    res.json(catalogue);
  } catch (error) {
    next(error);
  }
};

/**
 * Create new catalogue
 */
export const createCatalogue = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const {
      clientId,
      title,
      customMessage,
      candidateIds = [],
      includeSummary = true,
      includeDetails = true,
      includeVideo = true,
      includeExperience = true,
      includeSituation = true,
      includeCV = true,
    } = req.body;

    // Validate required fields
    if (!clientId || !title) {
      throw new ApiError(400, 'Client ID et titre sont requis');
    }

    // Check if client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new ApiError(404, 'Client non trouvé');
    }

    // Create catalogue with items
    const catalogue = await prisma.catalogue.create({
      data: {
        clientId,
        title,
        customMessage,
        includeSummary,
        includeDetails,
        includeVideo,
        includeExperience,
        includeSituation,
        includeCV,
        createdById: userId,
        items: {
          create: candidateIds.map((candidateId: string, index: number) => ({
            candidateId,
            order: index,
          })),
        },
      },
      include: {
        client: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          include: {
            candidate: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                status: true,
                globalRating: true,
                cvUrl: true,
                cvStoragePath: true,
              },
            },
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        resource: 'Catalogue',
        resourceId: catalogue.id,
        details: `Catalogue créé: ${catalogue.title} pour ${client.companyName || client.name}`,
      },
    });

    await invalidateCatalogueCaches(catalogue.id);

    res.status(201).json(catalogue);
  } catch (error) {
    next(error);
  }
};

/**
 * Update catalogue
 */
export const updateCatalogue = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const {
      title,
      customMessage,
      status,
      candidateIds,
      includeSummary,
      includeDetails,
      includeVideo,
      includeExperience,
      includeSituation,
      includeCV,
    } = req.body;

    // Check if catalogue exists
    const existingCatalogue = await prisma.catalogue.findUnique({
      where: { id },
    });

    if (!existingCatalogue) {
      throw new ApiError(404, 'Catalogue non trouvé');
    }

    // Update catalogue
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (title !== undefined) updateData.title = title;
    if (customMessage !== undefined) updateData.customMessage = customMessage;
    if (status !== undefined) updateData.status = status;
    if (includeSummary !== undefined) updateData.includeSummary = includeSummary;
    if (includeDetails !== undefined) updateData.includeDetails = includeDetails;
    if (includeVideo !== undefined) updateData.includeVideo = includeVideo;
    if (includeExperience !== undefined) updateData.includeExperience = includeExperience;
    if (includeSituation !== undefined) updateData.includeSituation = includeSituation;
    if (includeCV !== undefined) updateData.includeCV = includeCV;

    // If candidateIds is provided, update items
    if (candidateIds && Array.isArray(candidateIds)) {
      // Delete existing items
      await prisma.catalogueItem.deleteMany({
        where: { catalogueId: id },
      });

      // Create new items
      updateData.items = {
        create: candidateIds.map((candidateId: string, index: number) => ({
          candidateId,
          order: index,
        })),
      };
    }

    const catalogue = await prisma.catalogue.update({
      where: { id },
      data: updateData,
      include: {
        client: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          include: {
            candidate: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                status: true,
                globalRating: true,
                cvUrl: true,
                cvStoragePath: true,
              },
            },
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE',
        resource: 'Catalogue',
        resourceId: catalogue.id,
        details: `Catalogue modifié: ${catalogue.title}`,
      },
    });

    await invalidateCatalogueCaches(id);

    res.json(catalogue);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete catalogue (soft delete by updating status)
 */
export const deleteCatalogue = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const catalogue = await prisma.catalogue.findUnique({
      where: { id },
      include: { client: true },
    });

    if (!catalogue) {
      throw new ApiError(404, 'Catalogue non trouvé');
    }

    // D2 (audit) — la suppression est un HARD delete qui cascade les
    // catalogue_payments (pièces financières). On refuse de détruire un
    // catalogue déjà payé : à archiver plutôt qu'à supprimer.
    if ((catalogue as any).isPaid) {
      throw new ApiError(409, 'Ce catalogue a un paiement enregistré : suppression refusée. Archivez-le plutôt.');
    }

    // Delete catalogue
    await prisma.catalogue.delete({
      where: { id },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'DELETE',
        resource: 'Catalogue',
        resourceId: id,
        details: `Catalogue supprimé: ${catalogue.title}`,
      },
    });

    await invalidateCatalogueCaches(id);

    res.json({ message: 'Catalogue supprimé avec succès' });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate catalogue PDF
 */
export const generateCataloguePDF = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let tempPdfPath: string | null = null;
  const tempCvPaths: string[] = [];

  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const catalogue = await prisma.catalogue.findUnique({
      where: { id },
      include: {
        client: true,
        items: {
          include: {
            candidate: {
              include: {
                languages: true,
                experiences: true,
                availabilities: true,
                certifications: true,
              },
            },
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    if (!catalogue) {
      throw new ApiError(404, 'Catalogue non trouvé');
    }

    // Create temp directory if it doesn't exist
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const safeTitle = catalogue.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    tempPdfPath = path.join(tempDir, `catalogue_${safeTitle}_${timestamp}.pdf`);

    // Generate the main PDF
    await PDFService.generateCataloguePDF(catalogue as any, tempPdfPath);

    // If includeCV is true, merge CVs
    let finalPdfBuffer: Buffer;
    if (catalogue.includeCV) {
      // O2 — Récupère les CV EN PARALLÈLE (concurrence bornée) au lieu de
      // séquentiellement (~1 s par CV R2). L'ordre du catalogue est préservé
      // via un tableau indexé.
      const CV_DOWNLOAD_CONCURRENCY = 6;

      const cvSources = catalogue.items
        .map((item) => {
          const candidate = item.candidate;
          if (!candidate || !candidate.cvStoragePath) return null;
          return { itemId: item.id, candidate, storagePath: candidate.cvStoragePath as string };
        })
        .filter((x): x is { itemId: string; candidate: any; storagePath: string } => x !== null);

      // Résout chaque CV à sa position d'origine (null si absent/échec).
      const resolvedCvPaths: (string | null)[] = new Array(cvSources.length).fill(null);

      const resolveCv = async (idx: number) => {
        const { itemId, candidate, storagePath } = cvSources[idx];
        if (useR2 && storagePath.startsWith('cvs/')) {
          // CV sur R2 — téléchargé vers un fichier temporaire.
          try {
            const signedUrl = await getSignedFileUrl(storagePath, 3600);
            const response = await axios.get(signedUrl, { responseType: 'arraybuffer' });
            const tempCvPath = path.join(tempDir, `cv_${itemId}_${Date.now()}_${idx}.pdf`);
            fs.writeFileSync(tempCvPath, response.data);
            tempCvPaths.push(tempCvPath);
            resolvedCvPaths[idx] = tempCvPath;
          } catch (error) {
            logger.error('Catalogue: failed to download CV from R2', {
              candidateId: candidate.id,
              firstName: candidate.firstName,
              lastName: candidate.lastName,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else {
          // CV local
          const cvPath = path.join(__dirname, '../../', storagePath);
          if (fs.existsSync(cvPath)) {
            resolvedCvPaths[idx] = cvPath;
          }
        }
      };

      // Pool à concurrence bornée (évite d'ouvrir N téléchargements R2 d'un coup).
      let cvCursor = 0;
      const cvWorkers = Array.from(
        { length: Math.min(CV_DOWNLOAD_CONCURRENCY, cvSources.length) },
        async () => {
          while (cvCursor < cvSources.length) {
            const idx = cvCursor++;
            await resolveCv(idx);
          }
        }
      );
      await Promise.all(cvWorkers);

      const cvPaths = resolvedCvPaths.filter((p): p is string => p !== null);

      // Merge CVs if any exist
      if (cvPaths.length > 0) {
        finalPdfBuffer = await PDFService.mergeCVs(tempPdfPath, cvPaths);
      } else {
        finalPdfBuffer = fs.readFileSync(tempPdfPath);
      }
    } else {
      finalPdfBuffer = fs.readFileSync(tempPdfPath);
    }

    // Update catalogue status to GENERE
    await prisma.catalogue.update({
      where: { id },
      data: {
        status: 'GENERE',
        pdfUrl: `/api/catalogues/${id}/download`, // URL to download the PDF
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'EXPORT',
        resource: 'Catalogue',
        resourceId: id,
        details: `Génération PDF du catalogue: ${catalogue.title}${
          catalogue.includeCV ? ' (avec CVs)' : ''
        }`,
      },
    });

    // Clean up temp files
    if (tempPdfPath && fs.existsSync(tempPdfPath)) {
      fs.unlinkSync(tempPdfPath);
    }
    // Clean up temp CV files
    for (const tempCvPath of tempCvPaths) {
      if (fs.existsSync(tempCvPath)) {
        fs.unlinkSync(tempCvPath);
      }
    }

    // Send PDF as download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="catalogue_${safeTitle}_${timestamp}.pdf"`
    );
    res.send(finalPdfBuffer);
  } catch (error) {
    // Clean up temp files on error
    if (tempPdfPath && fs.existsSync(tempPdfPath)) {
      try {
        fs.unlinkSync(tempPdfPath);
      } catch (e) {
        logger.error('Catalogue: failed to delete temp file', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    // Clean up temp CV files on error
    for (const tempCvPath of tempCvPaths) {
      if (fs.existsSync(tempCvPath)) {
        try {
          fs.unlinkSync(tempCvPath);
        } catch (e) {
          logger.error('Catalogue: failed to delete temp CV file', {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
    next(error);
  }
};
/**
 * Generate shareable link for catalogue
 */
export const generateShareLink = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { expirationDays = 30 } = req.body;

    const catalogue = await prisma.catalogue.findUnique({
      where: { id },
      include: { client: true },
    });

    if (!catalogue) {
      throw new ApiError(404, 'Catalogue non trouvé');
    }

    // Import token utilities
    const { generateShareToken, getTokenExpiration } = await import('../utils/token');

    // Generate new share token
    const shareToken = generateShareToken();
    const shareTokenExpiresAt = getTokenExpiration(expirationDays);

    // Update catalogue with share token
    const updatedCatalogue = await prisma.catalogue.update({
      where: { id },
      data: {
        shareToken,
        shareTokenExpiresAt,
        status: 'ENVOYE', // Mark as sent when link is generated
        sentAt: catalogue.sentAt || new Date(),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        resource: 'Catalogue',
        resourceId: id,
        details: `Lien de partage généré pour catalogue: ${catalogue.title}`,
      },
    });

    // Generate full URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const shareUrl = `${frontendUrl}/catalogue/${shareToken}`;

    res.json({
      message: 'Lien de partage généré avec succès',
      shareToken,
      shareUrl,
      expiresAt: shareTokenExpiresAt,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get catalogue by share token (PUBLIC - no auth required)
 */
export const getCatalogueByToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token } = req.params;

    const catalogue = await prisma.catalogue.findFirst({
      where: { shareToken: token },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            companyName: true,
          },
        },
        items: {
          include: {
            candidate: {
              include: {
                languages: true,
                experiences: true,
                availabilities: true,
                certifications: true,
              },
            },
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    if (!catalogue) {
      throw new ApiError(404, 'Catalogue non trouvé');
    }

    // Check if token has expired
    const { isTokenExpired } = await import('../utils/token');
    if (isTokenExpired(catalogue.shareTokenExpiresAt)) {
      throw new ApiError(410, 'Ce lien a expiré');
    }

    // Update view tracking
    await prisma.catalogue.update({
      where: { id: catalogue.id },
      data: {
        viewedAt: catalogue.viewedAt || new Date(),
        lastViewedAt: new Date(),
        viewCount: { increment: 1 },
      },
    });

    const isContentRestricted = catalogue.requiresPayment && !catalogue.isPaid;

    // CONFIDENTIALITÉ CLIENT : on ne divulgue JAMAIS le CV ni l'adresse
    // complète ni les notes RH internes à un client. On masque ces champs
    // pour toutes les réponses (pas seulement quand le paiement est requis),
    // et on exclut les candidats supprimés (ex. promus Employé).
    catalogue.items = (catalogue.items || [])
      .filter((item) => item.candidate && !(item.candidate as any).isDeleted)
      .map((item) => ({
        ...item,
        candidate: {
          ...item.candidate,
          phone: null,
          email: null,
          address: null,
          fullAddress: null,
          postalCode: null,
          cvUrl: null,
          cvStoragePath: null,
          hrNotes: null,
          strengths: null,
          weaknesses: null,
          interviewDetails: null,
          // C1 (audit) — sur un lien PUBLIC (token qui peut circuler), ne jamais
          // exposer les identifiants sensibles ni les notes d'évaluation internes :
          // n° BSP, n° de permis, coordonnées GPS, clé R2 brute, sous-notes RH.
          bspNumber: null,
          bspExpiryDate: null,
          driverLicenseNumber: null,
          driverLicenseClass: null,
          lat: null,
          lng: null,
          videoStoragePath: null,
          professionalismRating: null,
          communicationRating: null,
          appearanceRating: null,
          motivationRating: null,
          experienceRating: null,
          // Si paiement requis non payé : on masque aussi le reste évaluatif
          ...(isContentRestricted
            ? { videoUrl: null, videoStoragePath: null, experiences: [], certifications: [] }
            : {}),
        },
      })) as unknown as typeof catalogue.items;

    res.json({
      ...catalogue,
      isContentRestricted,
    });
  } catch (error) {
    next(error);
  }
};
