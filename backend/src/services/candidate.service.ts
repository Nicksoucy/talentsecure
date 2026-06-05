import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { normalizeCityKey, seedCanonicalName, tidyCity } from '../utils/cityNormalize';
import { resolveCityCoordinates } from './cityGeocode.service';

// O1 — plafond du nombre de lignes exportées d'un coup (sécurité mémoire/timeout).
const EXPORT_ROW_CAP = 5000;

interface CandidateFilters {
    search?: string;
    status?: string;
    minRating?: number;
    city?: string;
    hasBSP?: boolean;
    hasVehicle?: boolean;
    hasVideo?: boolean;
    hasDriverLicense?: boolean;
    hasCV?: boolean;
    canWorkUrgent?: boolean;
    maxTravelKm?: number;
    bspStatus?: string;
    interviewDateStart?: string;
    interviewDateEnd?: string;
    includeArchived?: boolean;
    certification?: string;
}

interface PaginationOptions {
    page: number;
    limit: number;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
}

export class CandidateService {
    async findAll(filters: CandidateFilters, pagination: PaginationOptions) {
        const { page, limit, sortBy, sortOrder } = pagination;
        const skip = (page - 1) * limit;

        // Build filter conditions with proper AND/OR logic
        const where: any = {
            isDeleted: false,
            isActive: true,
        };

        // By default, exclude archived candidates unless explicitly requested
        if (!filters.includeArchived) {
            where.isArchived = false;
        }

        // Collect OR conditions to combine them properly
        const orConditions: any[] = [];

        // Search filter
        if (filters.search) {
            orConditions.push({
                OR: [
                    { firstName: { contains: filters.search, mode: 'insensitive' } },
                    { lastName: { contains: filters.search, mode: 'insensitive' } },
                    { email: { contains: filters.search, mode: 'insensitive' } },
                    { phone: { contains: filters.search, mode: 'insensitive' } },
                ],
            });
        }

        // CV filter
        if (filters.hasCV !== undefined) {
            if (filters.hasCV) {
                orConditions.push({
                    OR: [
                        { cvUrl: { not: null } },
                        { cvStoragePath: { not: null } },
                    ],
                });
            } else {
                where.cvUrl = null;
                where.cvStoragePath = null;
            }
        }

        // Apply OR conditions using AND to combine them
        if (orConditions.length > 0) {
            where.AND = orConditions;
        }

        if (filters.status) {
            where.status = filters.status;
        }

        if (filters.minRating) {
            where.globalRating = { gte: filters.minRating };
        }

        if (filters.city) {
            where.city = { contains: filters.city, mode: 'insensitive' };
        }

        if (filters.hasBSP !== undefined) {
            where.hasBSP = filters.hasBSP;
        }

        if (filters.hasVehicle !== undefined) {
            where.hasVehicle = filters.hasVehicle;
        }

        // Filter by video presence
        if (filters.hasVideo !== undefined) {
            if (filters.hasVideo) {
                where.videoUrl = { not: null };
            } else {
                where.videoUrl = null;
            }
        }

        // Filter by driver license
        if (filters.hasDriverLicense !== undefined) {
            where.hasDriverLicense = filters.hasDriverLicense;
        }

        // Filter by urgent work capability
        if (filters.canWorkUrgent !== undefined) {
            where.canWorkUrgent = filters.canWorkUrgent;
        }

        // Filter by travel distance
        if (filters.maxTravelKm) {
            where.canTravelKm = { gte: filters.maxTravelKm };
        }

        // Filter by BSP status
        if (filters.bspStatus) {
            where.bspStatus = filters.bspStatus;
        }

        // Filter by interview date range
        if (filters.interviewDateStart || filters.interviewDateEnd) {
            where.interviewDate = {};
            if (filters.interviewDateStart) {
                where.interviewDate.gte = new Date(filters.interviewDateStart);
            }
            if (filters.interviewDateEnd) {
                where.interviewDate.lte = new Date(filters.interviewDateEnd);
            }
        }

        // Filter by certification
        if (filters.certification) {
            where.certifications = {
                some: {
                    name: {
                        contains: filters.certification,
                        mode: 'insensitive',
                    },
                },
            };
        }

        // Build orderBy with special handling for globalRating to place NULL values last
        let orderByClause: any;
        if (sortBy === 'globalRating') {
            // For globalRating, we want NULL values to be treated as 0 (lowest)
            // So they should always appear last when sorting DESC, and first when sorting ASC
            orderByClause = [
                { globalRating: { sort: sortOrder, nulls: 'last' } }
            ];
        } else {
            orderByClause = { [sortBy]: sortOrder };
        }

        // Get candidates with optimized select (only fields needed for list view)
        const [total, candidates] = await prisma.$transaction([
            prisma.candidate.count({ where }),
            prisma.candidate.findMany({
                where,
                skip,
                take: limit,
                orderBy: orderByClause,
                select: {
                    // Basic info (needed for list)
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true,
                    city: true,
                    province: true,

                    // Status & ratings (for display and filtering)
                    status: true,
                    globalRating: true,
                    interviewDate: true,

                    // Quick checks (for icons/badges)
                    hasBSP: true,
                    hasVehicle: true,
                    hasDriverLicense: true,
                    cvUrl: true,
                    videoUrl: true,

                    // Metadata (for display logic)
                    isActive: true,
                    isArchived: true,
                    createdAt: true,

                    // HR notes preview (truncated in UI anyway)
                    hrNotes: true,

                    // Relations (lightweight, needed for list)
                    availabilities: {
                        select: {
                            type: true,
                            isAvailable: true,
                        },
                    },
                    languages: {
                        select: {
                            language: true,
                            level: true,
                        },
                    },
                    certifications: {
                        select: {
                            name: true,
                            expiryDate: true,
                        },
                    },
                },
            }),
        ]);

        return {
            data: candidates,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };


    }

    async findSimilarCandidates(candidateId: string, limit: number = 3) {
        const candidate = await prisma.candidate.findUnique({
            where: { id: candidateId },
            include: { certifications: true }
        });

        if (!candidate) throw new Error('Candidate not found');

        // Find candidates in same city
        // We start with a broad search and rank them in memory
        const candidates = await prisma.candidate.findMany({
            where: {
                id: { not: candidateId },
                isDeleted: false,
                isActive: true,
                city: candidate.city || undefined, // Match city if exists
            },
            include: {
                certifications: true,
                availabilities: true,
                languages: true,
            },
            take: 20 // Fetch a pool of candidates to rank
        });

        // Scoring logic
        const scored = candidates.map(c => {
            let score = 0;

            // City match (already filtered mostly, but verify)
            if (c.city && candidate.city && c.city === candidate.city) score += 5;

            // Certifications match
            const sourceCertNames = candidate.certifications.map(cert => cert.name.toLowerCase());
            const targetCertNames = c.certifications.map(cert => cert.name.toLowerCase());
            const commonCerts = targetCertNames.filter(name => sourceCertNames.includes(name));
            score += commonCerts.length * 3;

            // BSP Match (Critical)
            if (candidate.hasBSP && c.hasBSP) score += 5;

            // Rating proximity
            if (c.globalRating && candidate.globalRating) {
                const diff = Math.abs(c.globalRating - candidate.globalRating);
                if (diff <= 1) score += 3;
                else if (diff <= 2) score += 1;
            }

            // Experience proximity (if available, assuming experienceRating is a proxy or we parse it)
            // For now, let's use experienceRating
            if (c.experienceRating && candidate.experienceRating) {
                const diff = Math.abs(c.experienceRating - candidate.experienceRating);
                if (diff <= 1) score += 2;
            }

            return { ...c, similarityScore: score };
        });

        // Sort by score desc
        return scored
            .sort((a, b) => b.similarityScore - a.similarityScore)
            .slice(0, limit);
    }

    /** Statistiques agrégées (total + comptage par statut). */
    async getStats() {
        const total = await prisma.candidate.count({
            where: { isDeleted: false, isActive: true },
        });

        const byStatus = await prisma.candidate.groupBy({
            by: ['status'],
            where: { isDeleted: false, isActive: true },
            _count: { status: true },
        });

        const statusCounts: Record<string, number> = {};
        byStatus.forEach((item) => {
            statusCounts[item.status] = item._count.status;
        });

        return {
            total,
            byStatus: statusCounts,
            elite: statusCounts['ELITE'] || 0,
            excellent: statusCounts['EXCELLENT'] || 0,
            veryGood: statusCounts['TRES_BON'] || 0,
            good: statusCounts['BON'] || 0,
            qualified: statusCounts['QUALIFIE'] || 0,
            toReview: statusCounts['A_REVOIR'] || 0,
            pending: statusCounts['EN_ATTENTE'] || 0,
            absent: statusCounts['ABSENT'] || 0,
            inactive: statusCounts['INACTIF'] || 0,
        };
    }

    /** Répartition des candidats par ville (triée décroissant, hors N/A). */
    async getByCity() {
        const candidates = await prisma.candidate.findMany({
            where: { isDeleted: false, isActive: true },
            select: { city: true, id: true },
        });

        // Regroupement par CLÉ NORMALISÉE (fusionne accents/casse/tirets/variantes)
        // → une vraie ville = une entrée. Nom affiché = canonique du seed si connu,
        // sinon la variante brute la plus fréquente.
        const groups = new Map<
            string,
            { count: number; canonical: string | null; variants: Map<string, number> }
        >();
        candidates.forEach((candidate) => {
            const raw = (candidate.city || '').trim();
            if (!raw) return;
            const key = normalizeCityKey(raw);
            if (!key) return;
            let g = groups.get(key);
            if (!g) {
                g = { count: 0, canonical: seedCanonicalName(key), variants: new Map() };
                groups.set(key, g);
            }
            g.count += 1;
            g.variants.set(raw, (g.variants.get(raw) || 0) + 1);
        });

        const cityEntries = [...groups.values()].map((g) => {
            const mostFrequent = [...g.variants.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
            return { city: g.canonical || tidyCity(mostFrequent), count: g.count };
        });

        // Coordonnées (seed → cache DB → géocodage en arrière-plan, non bloquant).
        const coordsMap = await resolveCityCoordinates(cityEntries.map((e) => e.city));

        return cityEntries
            .map(({ city, count }) => {
                const coords = coordsMap.get(city);
                return { city, count, lat: coords?.lat ?? null, lng: coords?.lng ?? null };
            })
            .sort((a, b) => b.count - a.count);
    }

    /**
     * Construit les lignes d'export CSV (mêmes filtres que la liste, sans
     * pagination). Le contrôleur se charge de la sérialisation json2csv.
     */
    async buildExportRows(query: Record<string, any>) {
        const {
            search, status, minRating, city, hasBSP, hasVehicle,
            hasDriverLicense, hasCV, canWorkUrgent, maxTravelKm, bspStatus,
            interviewDateStart, interviewDateEnd, includeArchived, certification,
        } = query;

        const where: any = { isDeleted: false };
        if (includeArchived !== 'true') where.isArchived = false;

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
        if (status) where.status = status;
        if (minRating) where.globalRating = { gte: Number(minRating) };
        if (city) where.city = { contains: city as string, mode: 'insensitive' };
        if (hasBSP !== undefined) where.hasBSP = hasBSP === 'true';
        if (hasVehicle !== undefined) where.hasVehicle = hasVehicle === 'true';
        if (hasDriverLicense !== undefined) where.hasDriverLicense = hasDriverLicense === 'true';
        if (canWorkUrgent !== undefined) where.canWorkUrgent = canWorkUrgent === 'true';
        if (hasCV !== undefined) {
            if (hasCV === 'true') {
                orConditions.push({ OR: [{ cvUrl: { not: null } }, { cvStoragePath: { not: null } }] });
            } else {
                where.AND = [{ cvUrl: null }, { cvStoragePath: null }];
            }
        }
        if (maxTravelKm) where.maxTravelKm = { gte: Number(maxTravelKm) };
        if (bspStatus) where.bspStatus = bspStatus;
        if (interviewDateStart || interviewDateEnd) {
            where.interviewDate = {};
            if (interviewDateStart) where.interviewDate.gte = new Date(interviewDateStart as string);
            if (interviewDateEnd) where.interviewDate.lte = new Date(interviewDateEnd as string);
        }
        if (certification) {
            where.certifications = { some: { name: certification as string } };
        }
        if (orConditions.length > 0) where.AND = orConditions;

        const candidates = await prisma.candidate.findMany({
            where,
            // O1 — plafond de sécurité : évite de charger toute la table en mémoire
            // (risque OOM/timeout Cloud Run sur de très gros exports).
            take: EXPORT_ROW_CAP,
            select: {
                id: true, firstName: true, lastName: true, email: true, phone: true,
                city: true, province: true, postalCode: true, status: true,
                globalRating: true, interviewDate: true, hasBSP: true, bspStatus: true,
                bspExpiryDate: true, hasVehicle: true, hasDriverLicense: true,
                canWorkUrgent: true, canTravelKm: true, cvUrl: true, videoUrl: true,
                isArchived: true, createdAt: true,
                certifications: { select: { name: true, expiryDate: true } },
                languages: { select: { language: true, level: true } },
            },
            orderBy: [
                { globalRating: { sort: 'desc', nulls: 'last' } },
                { lastName: 'asc' },
            ],
        });

        return candidates.map((candidate) => ({
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
                ? new Date(candidate.interviewDate).toLocaleDateString('fr-CA') : '',
            'A BSP': candidate.hasBSP ? 'Oui' : 'Non',
            'Statut BSP': candidate.bspStatus || '',
            'BSP expiration': candidate.bspExpiryDate
                ? new Date(candidate.bspExpiryDate).toLocaleDateString('fr-CA') : '',
            'A véhicule': candidate.hasVehicle ? 'Oui' : 'Non',
            'Permis de conduire': candidate.hasDriverLicense ? 'Oui' : 'Non',
            'Disponible urgent': candidate.canWorkUrgent ? 'Oui' : 'Non',
            'Distance max (km)': candidate.canTravelKm || '',
            'A CV': candidate.cvUrl ? 'Oui' : 'Non',
            'A vidéo': candidate.videoUrl ? 'Oui' : 'Non',
            Certifications: candidate.certifications.map((c) => c.name).join(', '),
            Langues: candidate.languages.map((l) => `${l.language} (${l.level})`).join(', '),
            Archivé: candidate.isArchived ? 'Oui' : 'Non',
            'Créé le': new Date(candidate.createdAt).toLocaleDateString('fr-CA'),
        }));
    }

    /** Recherche avancée multi-critères (POST body) avec pagination. */
    async advancedSearch(body: any) {
        const {
            cities = [], certifications = [], availability = [],
            minRating, hasVehicle, languages = [], skills = [],
            page = 1, limit = 20,
        } = body;

        const where: any = { isDeleted: false, isActive: true };

        if (cities.length > 0) where.city = { in: cities };

        if (certifications.includes('BSP')) where.hasBSP = true;
        if (certifications.includes('RCR')) where.hasRCR = true;
        if (certifications.includes('SSIAP')) where.hasSSIAP = true;
        if (certifications.includes('Permis')) where.hasDriverLicense = true;

        if (availability.includes('24/7')) where.available24_7 = true;
        if (availability.includes('days')) where.availableDays = true;
        if (availability.includes('nights')) where.availableNights = true;
        if (availability.includes('weekends')) where.availableWeekends = true;

        if (minRating) where.globalRating = { gte: Number(minRating) };
        if (hasVehicle !== undefined) where.hasVehicle = hasVehicle;

        if (languages.length > 0) {
            where.languages = { some: { language: { in: languages } } };
        }
        if (skills.length > 0) {
            where.skills = { some: { skill: { name: { in: skills, mode: 'insensitive' } } } };
        }

        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);

        const [candidates, total] = await Promise.all([
            prisma.candidate.findMany({
                where,
                skip,
                take,
                include: {
                    languages: true,
                    certifications: true,
                    skills: { include: { skill: true } },
                },
                orderBy: { globalRating: 'desc' },
            }),
            prisma.candidate.count({ where }),
        ]);

        return {
            data: candidates,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        };
    }
}

export const candidateService = new CandidateService();
