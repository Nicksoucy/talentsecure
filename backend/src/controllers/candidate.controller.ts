import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import logger from '../config/logger';
import { getCache, setCache, deleteCache, invalidateCacheByPrefix } from '../config/cache';
import { buildCacheKey } from '../utils/cache';
import { getStatusFromRating } from '../utils/candidate.utils';
import { Parser } from 'json2csv';
import { candidateService } from '../services/candidate.service';
import { aiExtractionService } from '../services/ai-extraction.service';

const CANDIDATE_LIST_CACHE_PREFIX = 'candidates:list';
const CANDIDATE_STATS_CACHE_KEY = 'candidates:stats';

const invalidateCandidateCaches = async () => {
  await Promise.all([
    invalidateCacheByPrefix(CANDIDATE_LIST_CACHE_PREFIX),
    deleteCache(CANDIDATE_STATS_CACHE_KEY),
  ]);
};



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
      return res.status(400).json({ error: 'Query string is required' });
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
      certification,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const cacheKey = buildCacheKey(CANDIDATE_LIST_CACHE_PREFIX, req.query);
    const cachedResponse = await getCache<{ data: any; pagination: any }>(cacheKey);

    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    const filters = {
      search: search as string,
      status: status as string,
      minRating: minRating ? Number(minRating) : undefined,
      city: city as string,
      hasBSP: hasBSP !== undefined ? hasBSP === 'true' : undefined,
      hasVehicle: hasVehicle !== undefined ? hasVehicle === 'true' : undefined,
      hasVideo: hasVideo !== undefined ? hasVideo === 'true' : undefined,
      hasDriverLicense: hasDriverLicense !== undefined ? hasDriverLicense === 'true' : undefined,
      hasCV: hasCV !== undefined ? hasCV === 'true' : undefined,
      canWorkUrgent: canWorkUrgent !== undefined ? canWorkUrgent === 'true' : undefined,
      maxTravelKm: maxTravelKm ? Number(maxTravelKm) : undefined,
      bspStatus: bspStatus as string,
      interviewDateStart: interviewDateStart as string,
      interviewDateEnd: interviewDateEnd as string,
      includeArchived: includeArchived === 'true',
      certification: certification as string,
    };

    const pagination = {
      page: Number(page),
      limit: Number(limit),
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
    };

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
      return res.status(404).json({ error: 'Candidat non trouvé' });
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

    // Calculate status automatically based on rating if not provided
    const finalGlobalRating = globalRating ? Number(globalRating) : null;
    const finalStatus = status || getStatusFromRating(finalGlobalRating);

    // Create candidate with nested data
    const candidate = await prisma.candidate.create({
      data: {
        // Personal info
        firstName,
        lastName,
        email,
        phone,
        address,
        city: city || 'Non spécifié',
        province: province || 'QC',
        postalCode,
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
      return res.status(404).json({ error: 'Candidat non trouvé' });
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
    const candidates = await prisma.candidate.findMany({
      where: {
        isDeleted: false,
        isActive: true,
      },
      select: {
        city: true,
        id: true,
      },
    });

    // Group by city and count
    const cityStats: { [key: string]: number } = {};
    candidates.forEach((candidate) => {
      const city = candidate.city || 'N/A';
      cityStats[city] = (cityStats[city] || 0) + 1;
    });

    // Convert to array and filter out N/A
    const stats = Object.entries(cityStats)
      .filter(([city]) => city !== 'N/A')
      .map(([city, count]) => ({
        city,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      data: stats,
    });
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

    const candidates = await prisma.candidate.findMany({
      where: {
        isDeleted: false,
        isActive: true,
        OR: [
          { firstName: { contains: q as string, mode: 'insensitive' } },
          { lastName: { contains: q as string, mode: 'insensitive' } },
          { email: { contains: q as string, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
      take: 10,
    });

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

    if (useR2) {
      // Generate signed URL
      const signedUrl = await getR2SignedUrl(candidate.videoStoragePath, 3600);
      return res.json({
        success: true,
        data: {
          videoUrl: signedUrl,
          expiresIn: 3600,
        },
      });
    } else {
      // Local or other
      const videoUrl = getVideoUrl(candidate.videoStoragePath);
      return res.json({
        success: true,
        data: {
          videoUrl,
        },
      });
    }
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

    // Get total count (active, non-deleted)
    const total = await prisma.candidate.count({
      where: {
        isDeleted: false,
        isActive: true,
      },
    });

    // Get count by status
    const byStatus = await prisma.candidate.groupBy({
      by: ['status'],
      where: {
        isDeleted: false,
        isActive: true,
      },
      _count: {
        status: true,
      },
    });

    // Convert to object for easier access
    const statusCounts: Record<string, number> = {};
    byStatus.forEach((item) => {
      statusCounts[item.status] = item._count.status;
    });

    // Get elite candidates (9.5+)
    const elite = statusCounts['ELITE'] || 0;

    // Get excellent candidates (9-9.4)
    const excellent = statusCounts['EXCELLENT'] || 0;

    // Get very good candidates (8.5-8.9)
    const veryGood = statusCounts['TRES_BON'] || 0;

    // Get good candidates (8-8.4)
    const good = statusCounts['BON'] || 0;

    // Get qualified candidates (7-7.9)
    const qualified = statusCounts['QUALIFIE'] || 0;

    // Get candidates to review (<7)
    const toReview = statusCounts['A_REVOIR'] || 0;

    // Get pending candidates
    const pending = statusCounts['EN_ATTENTE'] || 0;

    // Get absent candidates
    const absent = statusCounts['ABSENT'] || 0;

    // Get inactive candidates
    const inactive = statusCounts['INACTIF'] || 0;

    const payload = {
      success: true,
      data: {
        total,
        byStatus: statusCounts,
        elite,
        excellent,
        veryGood,
        good,
        qualified,
        toReview,
        pending,
        absent,
        inactive,
      },
    };

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
    const {
      search,
      status,
      minRating,
      city,
      hasBSP,
      hasVehicle,
      hasDriverLicense,
      hasCV,
      canWorkUrgent,
      maxTravelKm,
      bspStatus,
      interviewDateStart,
      interviewDateEnd,
      includeArchived,
      certification,
    } = req.query;

    // Build where clause (same logic as getCandidates)
    const where: any = {
      isDeleted: false,
    };

    // Only include archived if specifically requested
    if (includeArchived !== 'true') {
      where.isArchived = false;
    }

    // Search filter
    const orConditions: any[] = [];
    if (search) {
      orConditions.push({
        OR: [
          { firstName: { contains: search as string, mode: 'insensitive' } },
          { lastName: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
          { phone: { contains: search as string, mode: 'insensitive' } },
        ],
      });
    }

    // Status filter
    if (status) {
      where.status = status;
    }

    // Rating filter
    if (minRating) {
      where.globalRating = { gte: Number(minRating) };
    }

    // City filter
    if (city) {
      where.city = { contains: city as string, mode: 'insensitive' };
    }

    // Boolean filters
    if (hasBSP !== undefined) {
      where.hasBSP = hasBSP === 'true';
    }
    if (hasVehicle !== undefined) {
      where.hasVehicle = hasVehicle === 'true';
    }
    if (hasDriverLicense !== undefined) {
      where.hasDriverLicense = hasDriverLicense === 'true';
    }
    if (canWorkUrgent !== undefined) {
      where.canWorkUrgent = canWorkUrgent === 'true';
    }

    // CV filter
    if (hasCV !== undefined) {
      if (hasCV === 'true') {
        orConditions.push({
          OR: [
            { cvUrl: { not: null } },
            { cvStoragePath: { not: null } },
          ],
        });
      } else {
        where.AND = [
          { cvUrl: null },
          { cvStoragePath: null },
        ];
      }
    }

    // Travel distance filter
    if (maxTravelKm) {
      where.maxTravelKm = { gte: Number(maxTravelKm) };
    }

    // BSP status filter
    if (bspStatus) {
      where.bspStatus = bspStatus;
    }

    // Interview date range filter
    if (interviewDateStart || interviewDateEnd) {
      where.interviewDate = {};
      if (interviewDateStart) {
        where.interviewDate.gte = new Date(interviewDateStart as string);
      }
      if (interviewDateEnd) {
        where.interviewDate.lte = new Date(interviewDateEnd as string);
      }
    }

    // Certification filter
    if (certification) {
      where.certifications = {
        some: {
          name: certification as string,
        },
      };
    }

    // Combine OR conditions if any
    if (orConditions.length > 0) {
      where.AND = orConditions;
    }

    // Fetch all matching candidates (no pagination for export)
    const candidates = await prisma.candidate.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        city: true,
        province: true,
        postalCode: true,
        status: true,
        globalRating: true,
        interviewDate: true,
        hasBSP: true,
        bspStatus: true,
        bspExpiryDate: true,
        hasVehicle: true,
        hasDriverLicense: true,
        canWorkUrgent: true,
        canTravelKm: true,
        cvUrl: true,
        videoUrl: true,
        isArchived: true,
        createdAt: true,
        certifications: {
          select: {
            name: true,
            expiryDate: true,
          },
        },
        languages: {
          select: {
            language: true,
            level: true,
          },
        },
      },
      orderBy: [
        { globalRating: { sort: 'desc', nulls: 'last' } },
        { lastName: 'asc' },
      ],
    });

    // Transform data for CSV
    const csvData = candidates.map((candidate) => ({
      ID: candidate.id,
      Prénom: candidate.firstName,
      Nom: candidate.lastName,
      Email: candidate.email || '',
      Téléphone: candidate.phone || '',
      Ville: candidate.city || '',
      Province: candidate.province || '',
      'Code postal': candidate.postalCode || '',
      Statut: candidate.status || '',
      'Note globale': candidate.globalRating || '',
      'Date entrevue': candidate.interviewDate
        ? new Date(candidate.interviewDate).toLocaleDateString('fr-CA')
        : '',
      'A BSP': candidate.hasBSP ? 'Oui' : 'Non',
      'Statut BSP': candidate.bspStatus || '',
      'BSP expiration': candidate.bspExpiryDate
        ? new Date(candidate.bspExpiryDate).toLocaleDateString('fr-CA')
        : '',
      'A véhicule': candidate.hasVehicle ? 'Oui' : 'Non',
      'Permis de conduire': candidate.hasDriverLicense ? 'Oui' : 'Non',
      'Disponible urgent': candidate.canWorkUrgent ? 'Oui' : 'Non',
      'Distance max (km)': candidate.canTravelKm || '',
      'A CV': candidate.cvUrl ? 'Oui' : 'Non',
      'A vidéo': candidate.videoUrl ? 'Oui' : 'Non',
      Certifications: candidate.certifications
        .map((c) => c.name)
        .join(', '),
      Langues: candidate.languages
        .map((l) => `${l.language} (${l.level})`)
        .join(', '),
      Archivé: candidate.isArchived ? 'Oui' : 'Non',
      'Créé le': new Date(candidate.createdAt).toLocaleDateString('fr-CA'),
    }));

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
    const {
      cities = [],
      certifications = [],
      availability = [],
      minExperience,
      minRating,
      hasVehicle,
      languages = [],
      skills = [],
      page = 1,
      limit = 20,
    } = req.body;

    // Build dynamic where clause
    const where: any = {
      isDeleted: false,
      isActive: true,
    };

    // Filter by cities
    if (cities.length > 0) {
      where.city = { in: cities };
    }

    // Filter by certifications
    if (certifications.includes('BSP')) {
      where.hasBSP = true;
    }
    if (certifications.includes('RCR')) {
      where.hasRCR = true;
    }
    if (certifications.includes('SSIAP')) {
      where.hasSSIAP = true;
    }
    if (certifications.includes('Permis')) {
      where.hasDriverLicense = true;
    }

    // Filter by availability
    if (availability.includes('24/7')) {
      where.available24_7 = true;
    }
    if (availability.includes('days')) {
      where.availableDays = true;
    }
    if (availability.includes('nights')) {
      where.availableNights = true;
    }
    if (availability.includes('weekends')) {
      where.availableWeekends = true;
    }

    // Filter by rating
    if (minRating) {
      where.globalRating = { gte: Number(minRating) };
    }

    // Filter by vehicle
    if (hasVehicle !== undefined) {
      where.hasVehicle = hasVehicle;
    }

    // Filter by languages (if provided)
    if (languages.length > 0) {
      where.languages = {
        some: {
          language: { in: languages },
        },
      };
    }

    // Filter by skills (if provided)
    if (skills.length > 0) {
      where.skills = {
        some: {
          skill: {
            name: { in: skills, mode: 'insensitive' },
          },
        },
      };
    }

    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Execute query
    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
        where,
        skip,
        take,
        include: {
          languages: true,
          certifications: true,
          skills: {
            include: {
              skill: true,
            },
          },
        },
        orderBy: {
          globalRating: 'desc',
        },
      }),
      prisma.candidate.count({ where }),
    ]);

    res.json({
      success: true,
      data: candidates,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Error in advanced search:', error);
    next(error);
  }
};
