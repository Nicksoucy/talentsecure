import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { getCache, setCache, deleteCache, invalidateCacheByPrefix } from '../config/cache';
import { buildCacheKey } from '../utils/cache';

const PROSPECT_LIST_CACHE_PREFIX = 'prospects:list';
const PROSPECT_STATS_CACHE_KEY = 'prospects:stats';
const PROSPECT_CITY_CACHE_KEY = 'prospects:city-stats';

const invalidateProspectCaches = async () => {
  await Promise.all([
    invalidateCacheByPrefix(PROSPECT_LIST_CACHE_PREFIX),
    deleteCache(PROSPECT_STATS_CACHE_KEY),
    deleteCache(PROSPECT_CITY_CACHE_KEY),
  ]);
};

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
    const cacheKey = buildCacheKey(PROSPECT_LIST_CACHE_PREFIX, req.query);
    const cachedResponse = await getCache<{ data: any; pagination: any }>(cacheKey);

    if (cachedResponse) {
      return res.json(cachedResponse);
    }

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

    const [total, prospects] = await prisma.$transaction([
      prisma.prospectCandidate.count({ where }),
      prisma.prospectCandidate.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
    ]);

    const responsePayload = {
      data: prospects,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };

    await setCache(cacheKey, responsePayload, 120);

    res.json(responsePayload);
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

    await invalidateProspectCaches();

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

    await invalidateProspectCaches();

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

    await invalidateProspectCaches();

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

    await invalidateProspectCaches();

    res.json({
      message: 'Candidat marqué comme contacté',
      data: prospect,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deep sanitization: converts empty strings and undefined to null recursively
 */
const sanitizePayload = (payload: any): any => {
  if (payload === '' || payload === undefined) return null;
  if (Array.isArray(payload)) return payload.map(sanitizePayload);
  if (payload && typeof payload === 'object') {
    return Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [key, sanitizePayload(value)])
    );
  }
  return payload;
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

    // Deep sanitize the entire payload before processing
    const rawBody = req.body;
    console.log('🔍 RAW req.body received from frontend (before sanitization):', {
      interviewDate: rawBody.interviewDate,
      bspExpiryDate: rawBody.bspExpiryDate,
      consentDate: rawBody.consentDate,
    });

    const formData = sanitizePayload(rawBody);

    console.log('✅ After sanitization (empty strings → null):', {
      interviewDate: formData.interviewDate,
      bspExpiryDate: formData.bspExpiryDate,
      consentDate: formData.consentDate,
      experiences: formData.experiences?.map((exp: any) => ({
        startDate: exp.startDate,
        endDate: exp.endDate,
      })),
      certifications: formData.certifications?.map((cert: any) => ({
        expiryDate: cert.expiryDate,
      })),
    });

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

    // Validate required fields
    if (!prospect.phone || prospect.phone.trim() === '') {
      return res.status(400).json({
        error: 'Le numéro de téléphone du prospect est requis pour la conversion'
      });
    }

    // Helper: Sanitize date fields (empty strings → null, YYYY-MM-DD → ISO-8601 DateTime)
    const sanitizeDateField = (value: any) => {
      if (value === '' || value === null || value === undefined) {
        return null;
      }
      // If date is in YYYY-MM-DD format, convert to ISO-8601 DateTime
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return new Date(value + 'T00:00:00.000Z').toISOString();
      }
      return value;
    };

    // Helper: Normalize language level to valid enum
    const normalizeLanguageLevel = (level: string): string => {
      const normalized = level?.toUpperCase().trim();
      const validLevels = ['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE', 'COURANT'];
      return validLevels.includes(normalized) ? normalized : 'INTERMEDIAIRE';
    };

    // Whitelist: Extract only valid Prisma candidate scalar fields
    const allowedFields = [
      'status', 'source', 'globalRating', 'professionalismRating',
      'communicationRating', 'appearanceRating', 'motivationRating',
      'experienceRating', 'hrNotes', 'strengths', 'weaknesses',
      'hasVehicle', 'canTravelKm', 'hasBSP', 'bspNumber', 'bspStatus',
      'hasDriverLicense', 'driverLicenseNumber', 'driverLicenseClass',
      'urgency24hScore', 'canWorkUrgent', 'hasConsent', 'consentSignature'
    ];

    const scalarData: any = {};
    for (const field of allowedFields) {
      if (formData[field] !== undefined) {
        scalarData[field] = formData[field];
      }
    }

    // Sanitize date fields
    scalarData.interviewDate = sanitizeDateField(formData.interviewDate);
    scalarData.bspExpiryDate = sanitizeDateField(formData.bspExpiryDate);
    scalarData.consentDate = sanitizeDateField(formData.consentDate);

    // Convert availability booleans to Prisma structure
    const availabilityTypes = [
      { key: 'availableDay', type: 'JOUR' },
      { key: 'availableEvening', type: 'SOIR' },
      { key: 'availableNight', type: 'NUIT' },
      { key: 'availableWeekend', type: 'FIN_DE_SEMAINE' },
    ];

    const availabilities = availabilityTypes
      .filter(av => formData[av.key] === true)
      .map(av => ({ type: av.type, isAvailable: true }));

    // Sanitize and normalize nested relations
    const sanitizedLanguages = (formData.languages || []).map((lang: any) => ({
      language: lang.language,
      level: normalizeLanguageLevel(lang.level),
      notes: lang.notes || null,
    }));

    const sanitizedExperiences = (formData.experiences || []).map((exp: any) => ({
      companyName: exp.companyName,
      position: exp.position,
      startDate: sanitizeDateField(exp.startDate),
      endDate: sanitizeDateField(exp.endDate),
      description: exp.description || null,
    }));

    const sanitizedCertifications = (formData.certifications || []).map((cert: any) => ({
      name: cert.name,
      issuingOrganization: cert.issuingOrganization || null,
      expiryDate: sanitizeDateField(cert.expiryDate),
    }));

    const sanitizedSituationTests = (formData.situationTests || []).map((test: any) => ({
      question: test.question,
      answer: test.answer,
      rating: test.rating || null,
      evaluatorNotes: test.evaluatorNotes || null,
    }));

    // Debug logging to see what's being sent to Prisma
    console.log('DEBUG - scalarData before Prisma create:', {
      interviewDate: scalarData.interviewDate,
      bspExpiryDate: scalarData.bspExpiryDate,
      consentDate: scalarData.consentDate,
    });

    // Create qualified candidate from prospect data
    const candidate = await prisma.candidate.create({
      data: {
        // Prospect identity (always preserved)
        firstName: prospect.firstName,
        lastName: prospect.lastName,
        email: prospect.email,
        phone: prospect.phone,
        address: prospect.fullAddress,
        city: prospect.city || 'Non spécifié',
        province: prospect.province || 'QC',
        postalCode: prospect.postalCode || '',
        cvUrl: prospect.cvUrl,
        cvStoragePath: prospect.cvStoragePath,

        // Form data (ratings, notes, etc.)
        ...scalarData,

        // Required metadata
        createdById: userId,

        // Nested creates using SANITIZED data
        ...(availabilities.length > 0 && {
          availabilities: { create: availabilities },
        }),
        ...(sanitizedLanguages.length > 0 && {
          languages: { create: sanitizedLanguages },
        }),
        ...(sanitizedExperiences.length > 0 && {
          experiences: { create: sanitizedExperiences },
        }),
        ...(sanitizedCertifications.length > 0 && {
          certifications: { create: sanitizedCertifications },
        }),
        ...(sanitizedSituationTests.length > 0 && {
          situationTests: { create: sanitizedSituationTests },
        }),
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

    await invalidateProspectCaches();

    res.status(201).json({
      message: 'Candidat potentiel converti en candidat qualifié avec succès',
      data: candidate,
    });
  } catch (error: any) {
    // Enhanced error logging for Prisma validation errors
    if (error.name === 'PrismaClientValidationError' || error.code?.startsWith('P')) {
      console.error('Prisma validation error during prospect conversion:', {
        errorCode: error.code,
        errorMeta: error.meta,
        prospectId: req.params.id,
        errorMessage: error.message,
      });
    }
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
    const cachedCities = await getCache<{ success: boolean; data: Array<{ city: string; count: number }> }>(PROSPECT_CITY_CACHE_KEY);
    if (cachedCities) {
      return res.json(cachedCities);
    }

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

    const payload = {
      success: true,
      data: stats,
    };

    await setCache(PROSPECT_CITY_CACHE_KEY, payload, 300);

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
    const cachedStats = await getCache<{ success: boolean; data: any }>(PROSPECT_STATS_CACHE_KEY);
    if (cachedStats) {
      return res.json(cachedStats);
    }

    const [total, contacted, converted, allTimeTotal] = await prisma.$transaction([
      prisma.prospectCandidate.count({ where: { isDeleted: false, isConverted: false } }),
      prisma.prospectCandidate.count({ where: { isDeleted: false, isConverted: false, isContacted: true } }),
      prisma.prospectCandidate.count({ where: { isDeleted: false, isConverted: true } }),
      prisma.prospectCandidate.count({ where: { isDeleted: false } }),
    ]);

    const pending = total - contacted;

    const payload = {
      success: true,
      data: {
        total,
        contacted,
        pending,
        converted,
        conversionRate: allTimeTotal > 0 ? ((converted / allTimeTotal) * 100).toFixed(1) : '0',
      },
    };

    await setCache(PROSPECT_STATS_CACHE_KEY, payload, 300);

    res.json(payload);
  } catch (error) {
    next(error);
  }
};
