import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import logger from '../config/logger';
import { getCache, setCache } from '../config/cache';
import { buildCacheKey } from '../utils/cache';
import { invalidateCaches } from '../utils/cacheInvalidation';
import { getStatusFromRating } from '../utils/candidate.utils';
import { canonicalCity } from '../utils/cityNormalize';
import { computeExperienceMonths } from '../utils/experience';
import { findContactEverywhere } from '../utils/candidateMatch';
import { resolveSearchIds } from '../utils/search';
import { resolveProspectCoordinates } from '../services/cityGeocode.service';
import { buildGeoMapPoints } from '../utils/geo';
import { Parser } from 'json2csv';
import { candidateService } from '../services/candidate.service';
import { aiExtractionService } from '../services/ai-extraction.service';
import { ApiError } from '../utils/apiError';

const CANDIDATE_LIST_CACHE_PREFIX = 'candidates:list';
const CANDIDATE_STATS_CACHE_KEY = 'candidates:stats';
const CANDIDATE_CITY_CACHE_KEY = 'candidates:city-stats';
const CANDIDATE_MAPPOINTS_CACHE_KEY = 'candidates:map-points';

const invalidateCandidateCaches = () =>
  invalidateCaches({
    listPrefix: CANDIDATE_LIST_CACHE_PREFIX,
    statKeys: [CANDIDATE_STATS_CACHE_KEY, CANDIDATE_CITY_CACHE_KEY, CANDIDATE_MAPPOINTS_CACHE_KEY],
  });



/**
 * Parse natural language search query
 */
export const parseNaturalLanguageSearch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { query } = req.body;

    if (!query) {
      throw new ApiError(400, 'Query string is required');
    }

    const filters = await aiExtractionService.parseSearchQuery(query);

    res.json({
      success: true,
      data: filters,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all candidates with filters
 */
export const getCandidates = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      search,
      status,
      minRating,
      city,
      hasBSP,
      hasVehicle,
      hasVideo,
      hasDriverLicense,
      hasCV,
      canWorkUrgent,
      maxTravelKm,
      bspStatus,
      interviewDateStart,
      interviewDateEnd,
      includeArchived,
      includeDeleted,
      includeInactive,
      certification,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    // Récupérer les supprimés/désactivés est réservé aux ADMIN (échappatoire
    // « inclure les supprimés » côté UI). Les autres rôles ne peuvent pas forcer.
    const isAdmin = req.user?.role === 'ADMIN';

    const cacheKey = buildCacheKey(CANDIDATE_LIST_CACHE_PREFIX, req.query);
    const cachedResponse = await getCache<{ data: any; pagination: any }>(cacheKey);

    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    // Le schéma de validation (Zod) transforme déjà les booléens 'true'/'false'
    // en vrais booléens et écrase req.query (Express 4) ; mais certains params
    // (includeDeleted/includeInactive) restent des chaînes. `truthy` coerce les
    // deux formes → robuste et corrige des filtres jusque-là cassés
    // (`boolean === 'true'` valait toujours false).
    const truthy = (v: unknown): boolean => v === true || v === 'true';

    const filters = {
      search: search as string,
      status: status as string,
      minRating: minRating ? Number(minRating) : undefined,
      city: city as string,
      hasBSP: hasBSP !== undefined ? truthy(hasBSP) : undefined,
      hasVehicle: hasVehicle !== undefined ? truthy(hasVehicle) : undefined,
      hasVideo: hasVideo !== undefined ? truthy(hasVideo) : undefined,
      hasDriverLicense: hasDriverLicense !== undefined ? truthy(hasDriverLicense) : undefined,
      hasCV: hasCV !== undefined ? truthy(hasCV) : undefined,
      canWorkUrgent: canWorkUrgent !== undefined ? truthy(canWorkUrgent) : undefined,
      maxTravelKm: maxTravelKm ? Number(maxTravelKm) : undefined,
      bspStatus: bspStatus as string,
      interviewDateStart: interviewDateStart as string,
      interviewDateEnd: interviewDateEnd as string,
      includeArchived: truthy(includeArchived),
      includeDeleted: isAdmin && truthy(includeDeleted),
      includeInactive: isAdmin && truthy(includeInactive),
      certification: certification as string,
    };

    const pagination = {
      page: Number(page),
      limit: Number(limit),
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
    };

    // ── Recherche par RAYON autour d'un point (nearLat/nearLng/nearRadiusKm) ──
    // Liste triée du plus proche au plus loin (distanceKm), mêmes filtres.
    const nearLat = Number(req.query.nearLat);
    const nearLng = Number(req.query.nearLng);
    const nearRadiusKm = Number(req.query.nearRadiusKm);
    if (Number.isFinite(nearLat) && Number.isFinite(nearLng) && Number.isFinite(nearRadiusKm) && nearRadiusKm > 0) {
      const nearPayload = await candidateService.findNear(
        filters,
        { lat: nearLat, lng: nearLng },
        nearRadiusKm,
        pagination
      );
      await setCache(cacheKey, nearPayload, 120);
      return res.json(nearPayload);
    }

    const responsePayload = await candidateService.findAll(filters, pagination);

    await setCache(cacheKey, responsePayload, 120);

    res.json(responsePayload);
  } catch (error) {
    next(error);
  }
};

/**
 * Get single candidate by ID
 */
export const getCandidateById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        availabilities: true,
        languages: true,
        experiences: {
          orderBy: { startDate: 'desc' },
        },
        certifications: true,
        situationTests: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!candidate || candidate.isDeleted) {
      throw new ApiError(404, 'Candidat non trouvé');
    }

    res.json({ data: candidate });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new candidate
 */
export const createCandidate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const {
      // Personal info
      firstName,
      lastName,
      email,
      phone,
      address,
      city,
      province,
      postalCode,
      interviewDate,
      // Status
      status,
      globalRating,
      // Ratings
      professionalismRating,
      communicationRating,
      appearanceRating,
      motivationRating,
      experienceRating,
      // Comments
      hrNotes,
      strengths,
      weaknesses,
      // Availability
      hasVehicle,
      canTravelKm,
      // Certifications
      hasBSP,
      bspNumber,
      bspExpiryDate,
      bspStatus,
      hasDriverLicense,
      driverLicenseNumber,
      driverLicenseClass,
      // Urgency
      urgency24hScore,
      canWorkUrgent,
      // Consent
      hasConsent,
      consentDate,
      consentSignature,
      // Related data
      availabilities,
      languages,
      experiences,
      certifications,
      situationTests,
    } = req.body;

    // DÉTECTION DE DOUBLON : un contact ne doit vivre qu'à une seule place.
    // Si email/téléphone correspond déjà ailleurs → 409 conflit (le frontend
    // proposera de déplacer le contact).
    const conflict = await findContactEverywhere(prisma, email, phone);
    if (conflict) {
      return res.status(409).json({
        error: `Ce contact existe déjà (${conflict.firstName} ${conflict.lastName}).`,
        conflict,
      });
    }

    // Calculate status automatically based on rating if not provided
    const finalGlobalRating = globalRating ? Number(globalRating) : null;
    const finalStatus = status || getStatusFromRating(finalGlobalRating);

    const normalizedCity = city ? canonicalCity(city) : 'Non spécifié'; // normalise à la saisie
    // Géocodage à la saisie : code postal (FSA) d'abord, sinon centre-ville.
    const geo = await resolveProspectCoordinates({ postalCode, city: normalizedCity });

    // Create candidate with nested data
    const candidate = await prisma.candidate.create({
      data: {
        // Personal info
        firstName,
        lastName,
        email,
        phone,
        address,
        city: normalizedCity,
        province: province || 'QC',
        postalCode,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        geocodedAt: geo ? new Date() : null,
        geocodeSource: geo?.source ?? null,
        interviewDate: interviewDate ? new Date(interviewDate) : null,
        // Status
        status: finalStatus,
        globalRating: finalGlobalRating,
        // Ratings
        professionalismRating: professionalismRating ? Number(professionalismRating) : null,
        communicationRating: communicationRating ? Number(communicationRating) : null,
        appearanceRating: appearanceRating ? Number(appearanceRating) : null,
        motivationRating: motivationRating ? Number(motivationRating) : null,
        experienceRating: experienceRating ? Number(experienceRating) : null,
        // Comments
        hrNotes,
        strengths,
        weaknesses,
        // Availability
        hasVehicle: hasVehicle || false,
        canTravelKm: canTravelKm ? Number(canTravelKm) : null,
        // Certifications
        hasBSP: hasBSP || false,
        bspNumber,
        bspExpiryDate: bspExpiryDate ? new Date(bspExpiryDate) : null,
        bspStatus,
        hasDriverLicense: hasDriverLicense || false,
        driverLicenseNumber,
        driverLicenseClass,
        // Urgency
        urgency24hScore: urgency24hScore ? Number(urgency24hScore) : 0,
        canWorkUrgent: canWorkUrgent || false,
        // Consent
        hasConsent: hasConsent || false,
        consentDate: consentDate ? new Date(consentDate) : null,
        consentSignature,
        // Creator
        createdById: userId,
        // Expérience dénormalisée (somme des mois) pour la recherche avancée.
        totalExperienceMonths: computeExperienceMonths(experiences),
        // Nested creates
        availabilities: availabilities ? {
          create: availabilities,
        } : undefined,
        languages: languages ? {
          create: languages,
        } : undefined,
        experiences: experiences ? {
          create: experiences,
        } : undefined,
        certifications: certifications ? {
          create: certifications,
        } : undefined,
        situationTests: situationTests ? {
          create: situationTests,
        } : undefined,
      },
      include: {
        availabilities: true,
        languages: true,
        experiences: true,
        certifications: true,
        situationTests: true,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        resource: 'Candidate',
        resourceId: candidate.id,
        details: `Candidat créé: ${firstName} ${lastName}`,
      },
    });

    await invalidateCandidateCaches();

    res.status(201).json({
      message: 'Candidat créé avec succès',
      data: candidate,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update candidate
 */
export const updateCandidate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const updateData = req.body;

    // Check if candidate exists
    const existingCandidate = await prisma.candidate.findUnique({
      where: { id },
    });

    if (!existingCandidate || existingCandidate.isDeleted) {
      throw new ApiError(404, 'Candidat non trouvé');
    }

    // Update candidate (exclude nested relations for now)
    const { availabilities, languages, experiences, certifications, situationTests, ...candidateData } = updateData;

    // If globalRating changed but status not provided, recalculate status
    if (candidateData.globalRating !== undefined && candidateData.status === undefined) {
      const newRating = candidateData.globalRating ? Number(candidateData.globalRating) : null;
      candidateData.status = getStatusFromRating(newRating);
    }

    // Convert interviewDate to Date if provided
    if (candidateData.interviewDate) {
      candidateData.interviewDate = new Date(candidateData.interviewDate);
    }

    // Normalise la ville à la saisie (si fournie et non vide).
    if (candidateData.city) {
      candidateData.city = canonicalCity(candidateData.city);
    }

    // Re-géocode si l'adresse change (code postal d'abord, sinon centre-ville).
    if (candidateData.postalCode !== undefined || candidateData.city !== undefined) {
      const geo = await resolveProspectCoordinates({
        postalCode: candidateData.postalCode ?? existingCandidate.postalCode,
        city: candidateData.city ?? existingCandidate.city,
      });
      candidateData.lat = geo?.lat ?? null;
      candidateData.lng = geo?.lng ?? null;
      candidateData.geocodedAt = geo ? new Date() : null;
      candidateData.geocodeSource = geo?.source ?? null;
    }

    // Prepare update data with nested relations handling
    const prismaUpdateData: any = { ...candidateData };

    // Handle relations: Delete old ones and create new ones if provided
    if (availabilities) {
      prismaUpdateData.availabilities = {
        deleteMany: {},
        create: availabilities,
      };
    }
    if (languages) {
      prismaUpdateData.languages = {
        deleteMany: {},
        create: languages,
      };
    }
    if (experiences) {
      prismaUpdateData.experiences = {
        deleteMany: {},
        create: experiences,
      };
      // Recalcule le total dénormalisé depuis les nouvelles expériences.
      prismaUpdateData.totalExperienceMonths = computeExperienceMonths(experiences);
    }
    if (certifications) {
      prismaUpdateData.certifications = {
        deleteMany: {},
        create: certifications,
      };
    }
    if (situationTests) {
      prismaUpdateData.situationTests = {
        deleteMany: {},
        create: situationTests,
      };
    }

    const candidate = await prisma.candidate.update({
      where: { id },
      data: prismaUpdateData,
      include: {
        availabilities: true,
        languages: true,
        experiences: true,
        certifications: true,
        situationTests: true,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE',
        resource: 'Candidate',
        resourceId: id,
        details: `Candidat modifié: ${candidate.firstName} ${candidate.lastName}`,
      },
    });

    await invalidateCandidateCaches();

    res.json({
      message: 'Candidat mis à jour avec succès',
      data: candidate,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete candidate (soft delete)
 */
export const deleteCandidate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const candidate = await prisma.candidate.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'DELETE',
        resource: 'Candidate',
        resourceId: id,
        details: `Candidat supprimé: ${candidate.firstName} ${candidate.lastName}`,
      },
    });

    await invalidateCandidateCaches();

    res.json({ message: 'Candidat supprimé avec succès' });
  } catch (error) {
    next(error);
  }
};

/**
 * Archive candidate
 */
export const archiveCandidate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const candidate = await prisma.candidate.update({
      where: { id },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        archivedById: userId,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE',
        resource: 'Candidate',
        resourceId: id,
        details: `Candidat archivé: ${candidate.firstName} ${candidate.lastName}`,
      },
    });

    await invalidateCandidateCaches();

    res.json({ message: 'Candidat archivé avec succès', data: candidate });
  } catch (error) {
    next(error);
  }
};

/**
 * Unarchive (restore) candidate
 */
export const unarchiveCandidate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const candidate = await prisma.candidate.update({
      where: { id },
      data: {
        isArchived: false,
        archivedAt: null,
        archivedById: null,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE',
        resource: 'Candidate',
        resourceId: id,
        details: `Candidat désarchivé: ${candidate.firstName} ${candidate.lastName}`,
      },
    });

    await invalidateCandidateCaches();

    res.json({ message: 'Candidat désarchivé avec succès', data: candidate });
  } catch (error) {
    next(error);
  }
};

/**
 * Get candidates statistics by city
 */
export const getCandidatesByCity = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // O6 — mise en cache (TTL 300s) : agrégation par ville coûteuse, invalidée
    // sur create/update via invalidateCandidateCaches().
    const cached = await getCache<{ success: boolean; data: any }>(CANDIDATE_CITY_CACHE_KEY);
    if (cached) {
      return res.json(cached);
    }

    const stats = await candidateService.getByCity();
    const payload = { success: true, data: stats };
    await setCache(CANDIDATE_CITY_CACHE_KEY, payload, 300);
    res.json(payload);
  } catch (error) {
    next(error);
  }
};

/**
 * Points carte « réels » : candidats regroupés par coordonnées individuelles —
 * centroïde du secteur postal (FSA, source 'postal') ou centre-ville pour ceux
 * sans code postal (source 'city'). Même affichage que la carte des prospects.
 */
export const getCandidatesMapPoints = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const cached = await getCache<{ success: boolean; data: any }>(
      CANDIDATE_MAPPOINTS_CACHE_KEY
    );
    if (cached) {
      return res.json(cached);
    }

    const candidates = await prisma.candidate.findMany({
      where: { isDeleted: false, isActive: true },
      select: { lat: true, lng: true, geocodeSource: true, postalCode: true, city: true },
    });

    const { points, unplaced } = buildGeoMapPoints(candidates);

    const payload = { success: true, data: { points, unplaced } };
    await setCache(CANDIDATE_MAPPOINTS_CACHE_KEY, payload, 300);

    res.json(payload);
  } catch (error) {
    next(error);
  }
};

/**
 * Get unique cities for autocomplete
 */
export const getCitiesSuggestions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { q } = req.query;

    const candidates = await prisma.candidate.findMany({
      where: {
        isDeleted: false,
        isActive: true,
        city: q ? { contains: q as string, mode: 'insensitive' } : undefined,
      },
      select: {
        city: true,
      },
      distinct: ['city'],
    });

    const cities = candidates
      .map((c) => c.city)
      .filter((city): city is string => city !== null && city !== 'Non spécifié')
      .sort();

    res.json({
      success: true,
      data: cities,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get candidate names for autocomplete
 */
export const getCandidatesSuggestions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { q } = req.query;

    if (!q || (q as string).length < 2) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const ids = await resolveSearchIds('candidates', String(q));
    const candidates = ids.length
      ? await prisma.candidate.findMany({
          where: {
            isDeleted: false,
            isActive: true,
            id: { in: ids },
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
          take: 10,
        })
      : [];

    const suggestions = candidates.map((c) => ({
      id: c.id,
      label: `${c.firstName} ${c.lastName}`,
      email: c.email,
    }));

    res.json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload video for a candidate
 */
export const uploadCandidateVideo = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Aucune vidéo fournie',
      });
    }

    // Check if candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id },
    });

    if (!candidate) {
      return res.status(404).json({
        success: false,
        error: 'Candidat non trouvé',
      });
    }

    // Import video service
    const { processVideoUpload, deleteVideo, getVideoUrl } = require('../services/video.service');

    // If candidate already has a video, delete the old one
    if (candidate.videoStoragePath) {
      try {
        await deleteVideo(candidate.videoStoragePath);
      } catch (error) {
        logger.error('Error deleting old video', { error });
        // Continue even if deletion fails
      }
    }

    // Process video upload
    const videoStoragePath = await processVideoUpload(
      req.file.path,
      req.file.originalname
    );

    // Generate the video URL (handles Google Drive, GCS, or local)
    const videoUrl = getVideoUrl(videoStoragePath);

    // Update candidate with video info
    const updatedCandidate = await prisma.candidate.update({
      where: { id },
      data: {
        videoStoragePath,
        videoUrl,
        videoUploadedAt: new Date(),
      },
    });

    await invalidateCandidateCaches();

    res.json({
      success: true,
      message: 'Vidéo uploadée avec succès',
      data: {
        id: updatedCandidate.id,
        videoStoragePath: updatedCandidate.videoStoragePath,
        videoUploadedAt: updatedCandidate.videoUploadedAt,
      },
    });
  } catch (error: any) {
    logger.error('Error uploading video', { error });
    next(error);
  }
};

/**
 * Get similar candidates
 */
export const getSimilarCandidates = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : 3;

    const candidates = await candidateService.findSimilarCandidates(id, limit);

    res.json({
      success: true,
      data: candidates,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get signed URL for candidate video
 */
export const getCandidateVideoUrl = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // Get candidate
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      select: {
        id: true,
        videoStoragePath: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!candidate || !candidate.videoStoragePath) {
      return res.status(404).json({
        success: false,
        error: 'Vidéo non trouvée',
      });
    }

    // Import video service
    const { getVideoUrl, getR2SignedUrl, useR2 } = require('../services/video.service');

    // The stored path looks like "videos/candidates/<timestamp>_<filename>",
    // which is the R2 key shape created by uploadVideoToR2. Whatever the
    // current USE_R2 env flag says, that key is *only* meaningful as an R2
    // object — there is no local file on the Cloud Run instance. So if the
    // path matches that shape we always sign an R2 URL, regardless of flag.
    // This is what prevented videos from playing: the controller fell into
    // the `else` branch and returned the raw key, which the browser resolved
    // against the frontend origin and got back the SPA's index.html.
    const looksLikeR2Key =
      candidate.videoStoragePath.startsWith('videos/') ||
      candidate.videoStoragePath.includes('/candidates/');

    let videoUrl: string;
    if (useR2 || looksLikeR2Key) {
      videoUrl = await getR2SignedUrl(candidate.videoStoragePath, 3600);
    } else {
      videoUrl = getVideoUrl(candidate.videoStoragePath);
    }

    // Defensive guard: a relative URL means we have no working absolute
    // location for this video. Fail loud instead of letting the browser
    // resolve it against the frontend domain (which serves the SPA HTML
    // and produces a silently broken <video> player).
    if (!/^https?:\/\//i.test(videoUrl)) {
      return res.status(500).json({
        success: false,
        error: `Configuration vidéo invalide (chemin ${candidate.videoStoragePath})`,
      });
    }

    return res.json({
      success: true,
      data: {
        videoUrl,
        expiresIn: 3600,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Initiate Direct Video Upload
 * Returns a signed URL for the client to upload directly to R2/GCS
 */
export const initiateVideoUpload = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { filename, contentType } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({
        success: false,
        error: 'Filename and content type are required'
      });
    }

    // Check if candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id },
    });

    if (!candidate) {
      return res.status(404).json({
        success: false,
        error: 'Candidat non trouvé',
      });
    }

    // Import video service
    const { getUploadSignedUrl } = require('../services/video.service');

    try {
      const { signedUrl, key, provider } = await getUploadSignedUrl(filename, contentType);

      res.json({
        success: true,
        data: {
          signedUrl,
          key,
          provider,
          expiresIn: 3600,
        },
      });
    } catch (err: any) {
      // If direct upload is not supported (e.g. Local/Drive), return specific error
      if (err.message.includes('not supported')) {
        return res.status(400).json({
          success: false,
          error: 'DIRECT_UPLOAD_NOT_SUPPORTED',
          message: err.message
        });
      }
      throw err;
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Complete Direct Video Upload
 * Notification from client that upload is finished. Updates DB.
 */
export const completeVideoUpload = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { key } = req.body;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'Storage key is required'
      });
    }

    // Check if candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id },
    });

    if (!candidate) {
      return res.status(404).json({
        success: false,
        error: 'Candidat non trouvé',
      });
    }

    // Import video service
    const { deleteVideo, getVideoUrl } = require('../services/video.service');

    // Delete old video if exists
    if (candidate.videoStoragePath) {
      try {
        await deleteVideo(candidate.videoStoragePath);
      } catch (error) {
        logger.error('Error deleting old video', { error });
      }
    }

    // Get public/embed URL from the key (we assume upload was successful)
    const videoUrl = getVideoUrl(key);

    // Update candidate
    const updatedCandidate = await prisma.candidate.update({
      where: { id },
      data: {
        videoStoragePath: key,
        videoUrl: videoUrl,
        videoUploadedAt: new Date(),
      },
    });

    await invalidateCandidateCaches();

    res.json({
      success: true,
      message: 'Vidéo confirmée avec succès',
      data: {
        id: updatedCandidate.id,
        videoStoragePath: updatedCandidate.videoStoragePath,
        videoUrl: updatedCandidate.videoUrl,
      },
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Delete video for a candidate
 */
export const deleteCandidateVideo = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // Get candidate
    const candidate = await prisma.candidate.findUnique({
      where: { id },
    });

    if (!candidate) {
      return res.status(404).json({
        success: false,
        error: 'Candidat non trouvé',
      });
    }

    if (!candidate.videoStoragePath) {
      return res.status(404).json({
        success: false,
        error: 'Aucune vidéo trouvée pour ce candidat',
      });
    }

    // Delete video from storage
    const { deleteVideo } = require('../services/video.service');
    await deleteVideo(candidate.videoStoragePath);

    // Update candidate
    await prisma.candidate.update({
      where: { id },
      data: {
        videoStoragePath: null,
        videoUploadedAt: null,
        videoUrl: null,
      },
    });

    await invalidateCandidateCaches();

    res.json({
      success: true,
      message: 'Vidéo supprimée avec succès',
    });
  } catch (error) {
    logger.error('Error deleting video', { error });
    next(error);
  }
};

/**
 * Get candidates statistics (total, by status, etc.)
 */
export const getCandidatesStats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const cachedStats = await getCache<{ success: boolean; data: any }>(CANDIDATE_STATS_CACHE_KEY);
    if (cachedStats) {
      return res.json(cachedStats);
    }

    const data = await candidateService.getStats();
    const payload = { success: true, data };

    await setCache(CANDIDATE_STATS_CACHE_KEY, payload, 300);

    res.json(payload);
  } catch (error) {
    logger.error('Error getting candidates stats', { error });
    next(error);
  }
};

/**
 * Export candidates as CSV
 * Supports same filters as getCandidates
 */
export const exportCandidatesCSV = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const csvData = await candidateService.buildExportRows(req.query as Record<string, any>);

    // Generate CSV
    const json2csvParser = new Parser({
      delimiter: ',',
      withBOM: true, // Add BOM for Excel compatibility with French characters
    });
    const csv = json2csvParser.parse(csvData);

    // Set headers for file download
    const filename = `candidats_export_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(csv);
  } catch (error) {
    console.error('Error exporting candidates CSV:', error);
    next(error);
  }
};

/**
 * Advanced search with multiple filters (Phase 1)
 * POST /api/candidates/advanced-search
 */
export const advancedSearch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { data, pagination } = await candidateService.advancedSearch(req.body);

    res.json({
      success: true,
      data,
      pagination,
    });
  } catch (error) {
    console.error('Error in advanced search:', error);
    next(error);
  }
};
