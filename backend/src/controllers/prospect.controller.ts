import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';

/**
 * Get all prospect candidates with filters
 */
export const getProspects = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      search,
      city,
      isContacted,
      isConverted,
      submissionDateStart,
      submissionDateEnd,
      page = 1,
      limit = 10,
      sortBy = 'submissionDate',
      sortOrder = 'desc',
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    // Build filter conditions
    const where: any = {
      isDeleted: false,
      isConverted: false, // Exclure les prospects déjà convertis en candidats
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (city) {
      where.city = { contains: city as string, mode: 'insensitive' };
    }

    if (isContacted !== undefined) {
      where.isContacted = isContacted === 'true';
    }

    if (isConverted !== undefined) {
      where.isConverted = isConverted === 'true';
    }

    // Filter by submission date range
    if (submissionDateStart || submissionDateEnd) {
      where.submissionDate = {};
      if (submissionDateStart) {
        where.submissionDate.gte = new Date(submissionDateStart as string);
      }
      if (submissionDateEnd) {
        where.submissionDate.lte = new Date(submissionDateEnd as string);
      }
    }

    // Get total count
    const total = await prisma.prospectCandidate.count({ where });

    // Get prospects
    const prospects = await prisma.prospectCandidate.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { [sortBy as string]: sortOrder },
    });

    res.json({
      data: prospects,
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
 * Get single prospect by ID
 */
export const getProspectById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const prospect = await prisma.prospectCandidate.findUnique({
      where: { id },
    });

    if (!prospect || prospect.isDeleted) {
      return res.status(404).json({ error: 'Candidat potentiel non trouvé' });
    }

    res.json({ data: prospect });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new prospect candidate
 * Si le prospect existe déjà (même email OU téléphone) ET n'est pas converti → mise à jour
 * Si le prospect existe ET est déjà converti → créer un nouveau (nouvelle candidature)
 * Sinon → créer nouveau
 */
export const createProspect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      streetAddress,
      city,
      province,
      postalCode,
      country,
      fullAddress,
      cvUrl,
      timezone,
      submissionDate,
      notes,
    } = req.body;

    // Vérifier si un prospect existe déjà avec le même email OU téléphone
    const whereConditions = [];
    if (email) {
      whereConditions.push({ email: { equals: email, mode: 'insensitive' as const } });
    }
    if (phone) {
      whereConditions.push({ phone });
    }

    let existingProspect = null;
    if (whereConditions.length > 0) {
      existingProspect = await prisma.prospectCandidate.findFirst({
        where: {
          isDeleted: false,
          OR: whereConditions,
        },
      });
    }

    const prospectData = {
      firstName,
      lastName,
      email,
      phone,
      streetAddress,
      city,
      province: province || 'QC',
      postalCode,
      country: country || 'CA',
      fullAddress,
      cvUrl,
      timezone,
      submissionDate: submissionDate ? new Date(submissionDate) : null,
      notes,
    };

    let prospect;
    let message;
    let statusCode;

    // Si existe ET non converti → mettre à jour
    if (existingProspect && !existingProspect.isConverted) {
      prospect = await prisma.prospectCandidate.update({
        where: { id: existingProspect.id },
        data: prospectData,
      });
      message = 'Candidat potentiel mis à jour avec les nouvelles informations';
      statusCode = 200;
    }
    // Si existe ET converti OU n'existe pas → créer nouveau
    else {
      prospect = await prisma.prospectCandidate.create({
        data: prospectData,
      });
      message = 'Candidat potentiel créé avec succès';
      statusCode = 201;
    }

    res.status(statusCode).json({
      message,
      data: prospect,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update prospect candidate
 */
export const updateProspect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if prospect exists
    const existingProspect = await prisma.prospectCandidate.findUnique({
      where: { id },
    });

    if (!existingProspect || existingProspect.isDeleted) {
      return res.status(404).json({ error: 'Candidat potentiel non trouvé' });
    }

    // Update prospect
    const prospect = await prisma.prospectCandidate.update({
      where: { id },
      data: updateData,
    });

    res.json({
      message: 'Candidat potentiel mis à jour avec succès',
      data: prospect,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete prospect (soft delete)
 */
export const deleteProspect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const prospect = await prisma.prospectCandidate.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    res.json({ message: 'Candidat potentiel supprimé avec succès' });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark prospect as contacted
 */
export const markAsContacted = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const prospect = await prisma.prospectCandidate.update({
      where: { id },
      data: {
        isContacted: true,
        contactedAt: new Date(),
        notes,
      },
    });

    res.json({
      message: 'Candidat marqué comme contacté',
      data: prospect,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Convert prospect to qualified candidate
 */
export const convertToCandidate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const candidateData = req.body;

    // Get prospect
    const prospect = await prisma.prospectCandidate.findUnique({
      where: { id },
    });

    if (!prospect || prospect.isDeleted) {
      return res.status(404).json({ error: 'Candidat potentiel non trouvé' });
    }

    if (prospect.isConverted) {
      return res.status(400).json({
        error: 'Ce candidat a déjà été converti',
        convertedToId: prospect.convertedToId,
      });
    }

    // Create qualified candidate from prospect data
    const candidate = await prisma.candidate.create({
      data: {
        // Copy from prospect
        firstName: prospect.firstName,
        lastName: prospect.lastName,
        email: prospect.email,
        phone: prospect.phone,
        address: prospect.fullAddress,
        city: prospect.city || 'Non spécifié',
        province: prospect.province || 'QC',
        postalCode: prospect.postalCode,
        cvUrl: prospect.cvUrl,
        cvStoragePath: prospect.cvStoragePath,
        // Add candidate-specific data from request
        ...candidateData,
        // Creator
        createdById: userId,
        // Nested creates if provided
        availabilities: candidateData.availabilities ? {
          create: candidateData.availabilities,
        } : undefined,
        languages: candidateData.languages ? {
          create: candidateData.languages,
        } : undefined,
        experiences: candidateData.experiences ? {
          create: candidateData.experiences,
        } : undefined,
        certifications: candidateData.certifications ? {
          create: candidateData.certifications,
        } : undefined,
        situationTests: candidateData.situationTests ? {
          create: candidateData.situationTests,
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

    // Mark prospect as converted
    await prisma.prospectCandidate.update({
      where: { id },
      data: {
        isConverted: true,
        convertedAt: new Date(),
        convertedToId: candidate.id,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        resource: 'Candidate',
        resourceId: candidate.id,
        details: `Candidat créé depuis prospect: ${prospect.firstName} ${prospect.lastName}`,
      },
    });

    res.status(201).json({
      message: 'Candidat potentiel converti en candidat qualifié avec succès',
      data: candidate,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get prospects statistics by city
 */
export const getProspectsByCity = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const prospects = await prisma.prospectCandidate.findMany({
      where: {
        isDeleted: false,
        isConverted: false, // Exclure les prospects déjà convertis
      },
      select: {
        city: true,
        id: true,
      },
    });

    // Group by city and count
    const cityStats: { [key: string]: number } = {};
    prospects.forEach((prospect) => {
      const city = prospect.city || 'N/A';
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

    const prospects = await prisma.prospectCandidate.findMany({
      where: {
        isDeleted: false,
        isConverted: false, // Exclure les prospects déjà convertis
        city: q ? { contains: q as string, mode: 'insensitive' } : undefined,
      },
      select: {
        city: true,
      },
      distinct: ['city'],
    });

    const cities = prospects
      .map((p) => p.city)
      .filter((city): city is string => city !== null && city !== 'N/A')
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
 * Get prospect names for autocomplete
 */
export const getProspectsSuggestions = async (
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

    const prospects = await prisma.prospectCandidate.findMany({
      where: {
        isDeleted: false,
        isConverted: false, // Exclure les prospects déjà convertis
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

    const suggestions = prospects.map((p) => ({
      id: p.id,
      label: `${p.firstName} ${p.lastName}`,
      email: p.email,
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
 * Get prospects statistics
 */
export const getProspectsStats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Total des prospects actifs (non convertis)
    const total = await prisma.prospectCandidate.count({
      where: { isDeleted: false, isConverted: false },
    });

    // Prospects actifs contactés
    const contacted = await prisma.prospectCandidate.count({
      where: { isDeleted: false, isConverted: false, isContacted: true },
    });

    // Prospects convertis en candidats
    const converted = await prisma.prospectCandidate.count({
      where: { isDeleted: false, isConverted: true },
    });

    // Total de tous les prospects (pour le taux de conversion)
    const allTimeTotal = await prisma.prospectCandidate.count({
      where: { isDeleted: false },
    });

    const pending = total - contacted;

    res.json({
      success: true,
      data: {
        total,
        contacted,
        pending,
        converted,
        conversionRate: allTimeTotal > 0 ? ((converted / allTimeTotal) * 100).toFixed(1) : '0',
      },
    });
  } catch (error) {
    next(error);
  }
};
