import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { getCache, setCache } from '../config/cache';
import { buildCacheKey } from '../utils/cache';
import { invalidateCaches } from '../utils/cacheInvalidation';
import { findContactEverywhere } from '../utils/candidateMatch';

const PROSPECT_LIST_CACHE_PREFIX = 'prospects:list';
const PROSPECT_STATS_CACHE_KEY = 'prospects:stats';
const PROSPECT_CITY_CACHE_KEY = 'prospects:city-stats';

const invalidateProspectCaches = () =>
  invalidateCaches({
    listPrefix: PROSPECT_LIST_CACHE_PREFIX,
    statKeys: [PROSPECT_STATS_CACHE_KEY, PROSPECT_CITY_CACHE_KEY],
  });

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
      hasVideo,
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

    // Filtre vidéo : avec / sans vidéo de présentation
    if (hasVideo === 'true') {
      where.videoStoragePath = { not: null };
    } else if (hasVideo === 'false') {
      where.videoStoragePath = null;
    }

    // NOUVEAU : Filtrage dynamique pour masquer/afficher prospects déjà traités
    const includeProcessed = req.query.includeProcessed;
    if (includeProcessed === 'false') {
      where.skills = { none: {} }; // Exclure prospects avec skills extraites
    }

    // Filter by submission date range
    if (submissionDateStart || submissionDateEnd) {
      where.submissionDate = {};
      if (submissionDateStart) {
        where.submissionDate.gte = new Date(submissionDateStart as string);
      }
      if (submissionDateEnd) {
        const end = new Date(submissionDateEnd as string);
        end.setHours(23, 59, 59, 999); // inclure toute la journée de fin
        where.submissionDate.lte = end;
      }
    }

    // Tri par date de soumission (plus récent au plus vieux par défaut).
    // Les candidats avec vidéo restent identifiés par l'étoile ⭐, mais
    // l'ordre de la liste suit la date d'entrée.
    const orderBy: any = { [sortBy as string]: sortOrder };

    const [total, prospects] = await prisma.$transaction([
      prisma.prospectCandidate.count({ where }),
      prisma.prospectCandidate.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy,
        include: {
          _count: {
            select: { skills: true }, // Compter skills pour chaque prospect
          },
        },
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
      source: 'manual',
    };

    // DÉTECTION DE DOUBLON : un contact ne doit vivre qu'à une seule place
    // (Employé / Candidat / Prospect). Si trouvé → 409, le frontend proposera
    // de déplacer le contact.
    const conflict = await findContactEverywhere(prisma, email, phone);
    if (conflict) {
      return res.status(409).json({
        error: `Ce contact existe déjà (${conflict.firstName} ${conflict.lastName}).`,
        conflict,
      });
    }

    const prospect = await prisma.prospectCandidate.create({ data: prospectData });
    await invalidateProspectCaches();

    res.status(201).json({
      message: 'Candidat potentiel créé avec succès',
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

    // GARDE-FOU CRITIQUE: Cette fonction NE PEUT être appelée que par un utilisateur humain authentifié
    // L'IA ne doit JAMAIS convertir automatiquement un prospect en candidat
    if (!userId || !req.user) {
      return res.status(403).json({
        error: 'Accès refusé: seul un utilisateur authentifié peut convertir un prospect en candidat',
      });
    }

    // PROTECTION: Interdire les conversions automatiques (détection de patterns d'IA)
    const suspiciousPatterns = ['auto-converti', 'extraction ia', 'ai converted', 'auto converted'];
    const hrNotesLower = (formData.hrNotes || '').toLowerCase();
    const hasAutoConvertPattern = suspiciousPatterns.some(pattern => hrNotesLower.includes(pattern));

    if (hasAutoConvertPattern) {
      return res.status(403).json({
        error: 'Conversion automatique interdite: seul un humain peut convertir un prospect en candidat',
        hint: 'Les notes ne doivent pas contenir de marqueurs d\'auto-conversion',
      });
    }

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

/**
 * Get prospects statistics for Autre Compétence (processed vs unprocessed)
 */
export const getProspectsExtractionStats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const cacheKey = 'prospects:extraction-stats';
    const cachedStats = await getCache<{ total: number; withSkills: number; withoutSkills: number }>(cacheKey);

    if (cachedStats) {
      return res.json(cachedStats);
    }

    const [total, withSkills] = await prisma.$transaction([
      prisma.prospectCandidate.count({
        where: { isDeleted: false, isConverted: false }
      }),
      prisma.prospectCandidate.count({
        where: {
          isDeleted: false,
          isConverted: false,
          skills: { some: {} } // Au moins 1 skill extraite
        }
      })
    ]);

    const payload = {
      total,
      withSkills,
      withoutSkills: total - withSkills
    };

    await setCache(cacheKey, payload, 120); // Cache 2 minutes

    res.json(payload);
  } catch (error) {
    next(error);
  }
};

/**
 * Get extraction history for a specific prospect
 */
export const getProspectExtractionHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // Verify prospect exists
    const prospect = await prisma.prospectCandidate.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, isDeleted: true },
    });

    if (!prospect || prospect.isDeleted) {
      return res.status(404).json({ error: 'Prospect non trouvé' });
    }

    // Get extraction logs
    const logs = await prisma.cvExtractionLog.findMany({
      where: { candidateId: id },
      orderBy: { createdAt: 'desc' },
    });

    // Get current skills count
    const currentSkillsCount = await prisma.prospectSkill.count({
      where: { prospectId: id },
    });

    res.json({
      prospect: {
        id: prospect.id,
        name: `${prospect.firstName} ${prospect.lastName}`,
      },
      currentSkillsCount,
      logs: logs.map(log => ({
        id: log.id,
        date: log.createdAt,
        method: log.extractionMethod,
        model: log.aiModel,
        skillsFound: log.skillsFound,
        processingTimeMs: log.processingTimeMs,
        promptTokens: log.promptTokens,
        completionTokens: log.completionTokens,
        totalCost: log.totalCost,
        success: log.success,
        errorMessage: log.errorMessage,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lance la synchronisation du survey vidéo GHL (bouton manuel / backfill).
 * POST /api/prospects/sync-survey  body: { limit?: number }
 */
export const syncSurveyProspects = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { syncSurvey } = require('../services/survey-sync.service');
    const limit = req.body?.limit ? Number(req.body.limit) : undefined;
    const summary = await syncSurvey(limit);
    await invalidateProspectCaches();
    res.json({ message: 'Synchronisation terminée', data: summary });
  } catch (error) {
    next(error);
  }
};

/**
 * URL signée du CV d'un prospect (R2 si stocké, sinon URL GHL d'origine).
 * GET /api/prospects/:id/cv-url
 */
export const getProspectCvUrl = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const prospect = await prisma.prospectCandidate.findUnique({
      where: { id },
      select: { cvStoragePath: true, cvUrl: true },
    });
    if (!prospect) return res.status(404).json({ error: 'Prospect non trouvé' });

    if (prospect.cvStoragePath) {
      const { getSignedFileUrl } = require('../services/r2.service');
      const url = await getSignedFileUrl(prospect.cvStoragePath, 3600);
      return res.json({ success: true, data: { url, expiresIn: 3600 } });
    }
    if (prospect.cvUrl) {
      return res.json({ success: true, data: { url: prospect.cvUrl } });
    }
    return res.status(404).json({ error: 'Aucun CV' });
  } catch (error) {
    next(error);
  }
};

/**
 * URL signée de la vidéo de présentation d'un prospect (R2).
 * GET /api/prospects/:id/video-url
 */
export const getProspectVideoUrl = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const prospect = await prisma.prospectCandidate.findUnique({
      where: { id },
      select: { videoStoragePath: true, videoUrl: true, videoUploadedAt: true },
    });
    if (!prospect) return res.status(404).json({ error: 'Prospect non trouvé' });

    if (prospect.videoStoragePath) {
      const { getSignedFileUrl } = require('../services/r2.service');
      const url = await getSignedFileUrl(prospect.videoStoragePath, 3600);
      return res.json({ success: true, data: { videoUrl: url, videoUploadedAt: prospect.videoUploadedAt, expiresIn: 3600 } });
    }
    return res.status(404).json({ error: 'Aucune vidéo' });
  } catch (error) {
    next(error);
  }
};

/**
 * Récupère la vidéo de présentation d'un prospect directement depuis GHL
 * (utile quand le prospect a été créé AVANT que le workflow envoie video_url).
 * Cherche le contact GHL par email/téléphone, repère le champ custom contenant
 * un fichier video/*, le télécharge dans R2, met à jour la fiche.
 * POST /api/prospects/:id/refresh-video-from-ghl
 */
export const refreshProspectVideoFromGhl = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const prospect = await prisma.prospectCandidate.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, videoStoragePath: true },
    });
    if (!prospect) return res.status(404).json({ error: 'Prospect introuvable' });
    if (prospect.videoStoragePath) {
      return res.status(200).json({ message: 'Vidéo déjà présente', alreadyHasVideo: true });
    }
    const email = (prospect.email || '').trim();
    const phone = (prospect.phone || '').trim();
    if (!email && !phone) return res.status(400).json({ error: 'Pas d\'email ni téléphone pour chercher dans GHL' });

    const GHL_BASE = 'https://services.leadconnectorhq.com';
    const TOKEN = process.env.GHL_PIT_TOKEN || 'pit-7de455ab-c46e-47a4-af9e-0b07a6c3a1ee';
    const LOC = process.env.GHL_LOCATION_ID || 'dfkLurZY2ADWAUZl4zYc';
    const ghlH = { Authorization: `Bearer ${TOKEN}`, Version: '2021-07-28' };

    // 1) Trouver le contact GHL
    const axios = require('axios');
    let contactId: string | null = null;
    if (email) {
      const r = await axios.get(`${GHL_BASE}/contacts/search/duplicate`, { params: { locationId: LOC, email }, headers: ghlH }).catch(() => null);
      contactId = r?.data?.contact?.id || null;
    }
    if (!contactId && phone) {
      const r = await axios.get(`${GHL_BASE}/contacts/search/duplicate`, { params: { locationId: LOC, number: phone }, headers: ghlH }).catch(() => null);
      contactId = r?.data?.contact?.id || null;
    }
    if (!contactId) return res.status(404).json({ error: 'Contact GHL introuvable' });

    // 2) Récupérer les custom fields
    const full = await axios.get(`${GHL_BASE}/contacts/${contactId}`, { headers: ghlH }).then((r: any) => r.data?.contact);
    let videoFileUrl: string | null = null;
    for (const f of (full?.customFields || [])) {
      const v = f.value;
      if (!v || typeof v !== 'object') continue;
      for (const key of Object.keys(v)) {
        const fo = (v as any)[key];
        const mime = (fo?.meta?.mimetype || '').toLowerCase();
        if (fo?.url && mime.startsWith('video/')) {
          videoFileUrl = fo.url;
          break;
        }
      }
      if (videoFileUrl) break;
    }
    if (!videoFileUrl) return res.status(404).json({ error: 'Aucune vidéo trouvée dans GHL pour ce contact (aucun fichier video/* dans les custom fields).' });

    // 3) Télécharger
    let file: any;
    try {
      const { downloadGhlFile } = require('../utils/ghlFetch');
      file = await downloadGhlFile(videoFileUrl);
    } catch (e: any) {
      console.error('Refresh video: téléchargement GHL échec', e?.message);
      return res.status(502).json({ error: `Échec téléchargement GHL : ${e?.message || 'inconnu'}` });
    }

    // 4) Valider que c'est une vraie vidéo (magic bytes)
    const { isLikelyVideo, detectExtension } = require('../utils/ghlFetch');
    if (!file?.buffer || file.buffer.length < 100) {
      return res.status(400).json({ error: `Fichier vide ou trop petit (${file?.buffer?.length || 0} octets).` });
    }
    if (!isLikelyVideo(file.buffer)) {
      return res.status(400).json({ error: `Le fichier téléchargé n'est pas une vidéo valide (magic bytes). Content-Type reçu: ${file.contentType || 'inconnu'}.` });
    }

    // 5) Upload R2
    let key: string;
    try {
      const { uploadBufferToR2 } = require('../services/r2.service');
      const ext = detectExtension(file, '');
      const safe = `${prospect.firstName}_${prospect.lastName}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) || 'video';
      key = `videos/prospects/${prospect.id}_${safe}${ext}`;
      await uploadBufferToR2(file.buffer, key, file.contentType);
    } catch (e: any) {
      console.error('Refresh video: upload R2 échec', e?.message);
      return res.status(500).json({ error: `Échec upload R2 : ${e?.message || 'inconnu'}` });
    }

    // 6) Mettre à jour la fiche
    try {
      await prisma.prospectCandidate.update({
        where: { id: prospect.id },
        data: { videoUrl: videoFileUrl, videoStoragePath: key, videoUploadedAt: new Date() },
      });
    } catch (e: any) {
      return res.status(500).json({ error: `Échec mise à jour DB : ${e?.message || 'inconnu'}` });
    }

    res.json({ success: true, message: 'Vidéo récupérée et stockée', videoStoragePath: key });
  } catch (error: any) {
    console.error('Refresh video from GHL erreur globale:', error?.message);
    return res.status(500).json({ error: `Erreur inattendue : ${error?.message || 'inconnu'}` });
  }
};

/**
 * Assigne (transfère) plusieurs prospects à un client donné.
 * Assignation interne gratuite : crée/upsert un ClientPurchase par prospect
 * (type=CV_ONLY, price=0). Les assignations ne sont PAS visibles dans le
 * portail client (côté client, les prospects sont déjà filtrés).
 *
 * POST /api/prospects/bulk-assign-to-client
 * body: { prospectIds: string[], clientId: string }
 */
export const bulkAssignProspectsToClient = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prospectIds, clientId } = req.body || {};
    if (!Array.isArray(prospectIds) || prospectIds.length === 0) {
      return res.status(400).json({ error: 'prospectIds requis (tableau non vide)' });
    }
    if (!clientId || typeof clientId !== 'string') {
      return res.status(400).json({ error: 'clientId requis' });
    }

    // Vérifier que le client existe
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
    if (!client) return res.status(404).json({ error: 'Client introuvable' });

    const prospects = await prisma.prospectCandidate.findMany({
      where: { id: { in: prospectIds }, isDeleted: false },
      select: { id: true, firstName: true, lastName: true, city: true },
    });

    let assigned = 0;
    let already = 0;
    let errors = 0;
    const details: string[] = [];

    for (const p of prospects) {
      try {
        // upsert : si déjà assigné (unique [clientId, prospectId]), on saute
        const existing = await prisma.clientPurchase.findUnique({
          where: { clientId_prospectId: { clientId, prospectId: p.id } },
        }).catch(() => null);
        if (existing) {
          already++;
          continue;
        }
        await prisma.clientPurchase.create({
          data: {
            clientId,
            prospectId: p.id,
            type: 'CV_ONLY',
            city: p.city || 'N/A',
            price: 0,
          },
        });
        assigned++;
      } catch (e: any) {
        errors++;
        details.push(`${p.firstName} ${p.lastName}: ${e?.message || 'erreur inconnue'}`);
      }
    }

    await invalidateProspectCaches();
    res.json({
      message: `${assigned} prospect(s) transféré(s) vers ${client.name}.`,
      assigned,
      alreadyAssigned: already,
      errors,
      details,
      clientId,
      clientName: client.name,
    });
  } catch (error: any) {
    console.error('Bulk-assign prospects erreur:', error?.message);
    return res.status(500).json({ error: `Erreur : ${error?.message || 'inconnu'}` });
  }
};

/**
 * Export ZIP : un .zip contenant prospects.csv + dossier cvs/ avec les CV
 * de chaque prospect téléchargés (R2 ou GHL).
 *
 * POST /api/prospects/export-zip  body: { prospectIds: string[] }
 */
export const exportProspectsZip = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prospectIds } = req.body || {};
    if (!Array.isArray(prospectIds) || prospectIds.length === 0) {
      return res.status(400).json({ error: 'prospectIds requis (tableau non vide)' });
    }
    const LIMIT = 200;
    const ids = prospectIds.slice(0, LIMIT);

    const prospects = await prisma.prospectCandidate.findMany({
      where: { id: { in: ids }, isDeleted: false },
      orderBy: { submissionDate: 'desc' },
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true,
        city: true, province: true, postalCode: true, streetAddress: true,
        cvUrl: true, cvStoragePath: true, videoStoragePath: true,
        submissionDate: true, isContacted: true, isConverted: true, notes: true,
      },
    });

    // archiver: en v7 CJS le module.exports est la factory ; en v8 ESM c'est { default }.
    // Belt + suspenders : prend l'un ou l'autre.
    const archiverMod = require('archiver');
    const archiver: any = typeof archiverMod === 'function' ? archiverMod : archiverMod.default;
    if (typeof archiver !== 'function') {
      throw new Error('archiver introuvable (factory non callable)');
    }
    const { downloadGhlFile, detectExtension } = require('../utils/ghlFetch');
    const { getSignedFileUrl } = require('../services/r2.service');
    const axios = require('axios');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="prospects_${new Date().toISOString().slice(0,10)}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err: any) => { console.error('ZIP error:', err); try { res.end(); } catch {} });
    archive.pipe(res);

    // 1) Construire le CSV des prospects
    const sanitize = (s: string) => (s || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) || 'sans_nom';
    const csvHeaders = [
      'No', 'Prénom', 'Nom', 'Email', 'Téléphone', 'Ville', 'Province', 'Code Postal', 'Adresse',
      'CV', 'Vidéo', 'Fichier CV', 'Date de soumission', 'Contacté', 'Converti', 'Notes',
    ];
    const rows: string[] = [csvHeaders.join(',')];

    // 2) Pour chaque prospect, télécharger le CV et l'ajouter au ZIP
    let cvDownloaded = 0, cvFailed = 0;
    for (let i = 0; i < prospects.length; i++) {
      const p = prospects[i];
      const num = String(i + 1).padStart(3, '0');
      let cvFilename = '';

      try {
        let buffer: Buffer | null = null;
        let contentType = '';
        if (p.cvStoragePath) {
          const url = await getSignedFileUrl(p.cvStoragePath, 600);
          const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
          buffer = Buffer.from(r.data);
          contentType = r.headers['content-type'] || 'application/octet-stream';
        } else if (p.cvUrl) {
          const file = await downloadGhlFile(p.cvUrl);
          buffer = file.buffer;
          contentType = file.contentType;
        }
        if (buffer && buffer.length > 100) {
          const ext = detectExtension({ buffer, contentType, contentDisposition: '' }, '');
          cvFilename = `${num}_${sanitize(p.firstName)}_${sanitize(p.lastName)}${ext}`;
          archive.append(buffer, { name: `cvs/${cvFilename}` });
          cvDownloaded++;
        }
      } catch (e: any) {
        cvFailed++;
        console.warn(`ZIP: CV échec pour ${p.firstName} ${p.lastName}: ${e?.message}`);
      }

      const escapeCsv = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      rows.push([
        num,
        escapeCsv(p.firstName),
        escapeCsv(p.lastName),
        escapeCsv(p.email || ''),
        escapeCsv(p.phone || ''),
        escapeCsv(p.city || ''),
        escapeCsv(p.province || ''),
        escapeCsv(p.postalCode || ''),
        escapeCsv(p.streetAddress || ''),
        (p.cvUrl || p.cvStoragePath) ? 'Oui' : 'Non',
        p.videoStoragePath ? 'Oui' : 'Non',
        escapeCsv(cvFilename),
        p.submissionDate ? new Date(p.submissionDate).toISOString().slice(0, 10) : '',
        p.isContacted ? 'Oui' : 'Non',
        p.isConverted ? 'Oui' : 'Non',
        escapeCsv(p.notes || ''),
      ].join(','));
    }

    // 3) Ajouter le CSV (avec BOM UTF-8 pour Excel)
    archive.append('﻿' + rows.join('\n'), { name: 'prospects.csv' });
    archive.append(
      `Export de ${prospects.length} prospects\nCVs téléchargés : ${cvDownloaded}\nCVs en échec : ${cvFailed}\nDate : ${new Date().toISOString()}\n`,
      { name: 'README.txt' }
    );

    await archive.finalize();
  } catch (error: any) {
    console.error('Export ZIP erreur:', error?.message, error?.stack);
    if (!res.headersSent) {
      res.status(500).json({
        error: `Erreur ZIP : ${error?.message || 'inconnu'}`,
        stack: process.env.NODE_ENV === 'production' ? undefined : error?.stack,
      });
    } else {
      try { res.end(); } catch {}
    }
  }
};
