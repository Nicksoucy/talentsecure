import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';

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
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    // Build filter conditions
    const where: any = {
      isDeleted: false,
      isActive: true,
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (minRating) {
      where.globalRating = { gte: Number(minRating) };
    }

    if (city) {
      where.city = { contains: city as string, mode: 'insensitive' };
    }

    if (hasBSP !== undefined) {
      where.hasBSP = hasBSP === 'true';
    }

    if (hasVehicle !== undefined) {
      where.hasVehicle = hasVehicle === 'true';
    }

    // Filter by video presence
    if (hasVideo !== undefined) {
      if (hasVideo === 'true') {
        where.videoUrl = { not: null };
      } else {
        where.videoUrl = null;
      }
    }

    // Filter by driver license
    if (hasDriverLicense !== undefined) {
      where.hasDriverLicense = hasDriverLicense === 'true';
    }

    // Filter by CV presence
    if (hasCV !== undefined) {
      if (hasCV === 'true') {
        where.OR = [
          { cvUrl: { not: null } },
          { cvStoragePath: { not: null } },
        ];
      } else {
        where.cvUrl = null;
        where.cvStoragePath = null;
      }
    }

    // Filter by urgent work capability
    if (canWorkUrgent !== undefined) {
      where.canWorkUrgent = canWorkUrgent === 'true';
    }

    // Filter by travel distance
    if (maxTravelKm) {
      where.canTravelKm = { gte: Number(maxTravelKm) };
    }

    // Filter by BSP status
    if (bspStatus) {
      where.bspStatus = bspStatus;
    }

    // Filter by interview date range
    if (interviewDateStart || interviewDateEnd) {
      where.interviewDate = {};
      if (interviewDateStart) {
        where.interviewDate.gte = new Date(interviewDateStart as string);
      }
      if (interviewDateEnd) {
        where.interviewDate.lte = new Date(interviewDateEnd as string);
      }
    }

    // Get total count
    const total = await prisma.candidate.count({ where });

    // Get candidates
    const candidates = await prisma.candidate.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { [sortBy as string]: sortOrder },
      include: {
        availabilities: true,
        languages: true,
        experiences: {
          orderBy: { startDate: 'desc' },
          take: 3,
        },
        certifications: true,
      },
    });

    res.json({
      data: candidates,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
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
        // Status
        status: status || 'EN_ATTENTE',
        globalRating: globalRating ? Number(globalRating) : null,
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

    const candidate = await prisma.candidate.update({
      where: { id },
      data: candidateData,
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

    res.json({ message: 'Candidat supprimé avec succès' });
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
    const { processVideoUpload, deleteVideo } = require('../services/video.service');

    // If candidate already has a video, delete the old one
    if (candidate.videoStoragePath) {
      try {
        await deleteVideo(candidate.videoStoragePath);
      } catch (error) {
        console.error('Error deleting old video:', error);
        // Continue even if deletion fails
      }
    }

    // Process video upload
    const videoStoragePath = await processVideoUpload(
      req.file.path,
      req.file.originalname
    );

    // Update candidate with video info
    const updatedCandidate = await prisma.candidate.update({
      where: { id },
      data: {
        videoStoragePath,
        videoUploadedAt: new Date(),
      },
    });

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
    console.error('Error uploading video:', error);
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
        firstName: true,
        lastName: true,
        videoStoragePath: true,
        videoUploadedAt: true,
      },
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

    // Generate signed URL
    const { getSignedUrl, GCS_VIDEO_BUCKET } = require('../config/storage');
    const videoUrl = await getSignedUrl(GCS_VIDEO_BUCKET, candidate.videoStoragePath, 3600);

    res.json({
      success: true,
      data: {
        videoUrl,
        videoUploadedAt: candidate.videoUploadedAt,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
      },
    });
  } catch (error) {
    console.error('Error getting video URL:', error);
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

    res.json({
      success: true,
      message: 'Vidéo supprimée avec succès',
    });
  } catch (error) {
    console.error('Error deleting video:', error);
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

    res.json({
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
    });
  } catch (error) {
    console.error('Error getting candidates stats:', error);
    next(error);
  }
};
