import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';

/**
 * Search talents by city (public marketplace for clients)
 * Returns partial candidate data (no contact info)
 */
export const searchTalentsByCity = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { city, minRating, hasVehicle, available24_7, availableDays, availableNights, availableWeekends, mode } = req.query;

        if (!city) {
            return res.status(400).json({ error: 'Ville requise' });
        }

        // Specific logic for CV Only mode (Prospects)
        if (mode === 'cvonly') {
            const prospects = await prisma.prospectCandidate.findMany({
                where: {
                    city: { contains: city as string, mode: 'insensitive' },
                    isDeleted: false,
                    isConverted: false,
                },
                select: {
                    id: true,
                    firstName: true,
                    city: true,
                    province: true,
                },
                take: 50,
            });

            // Map prospects to match the expected interface with default values
            // Prospects don't have all the details like ratings or specific availabilities yet
            const mappedProspects = prospects.map(p => ({
                id: p.id,
                firstName: p.firstName,
                city: p.city,
                province: p.province,
                globalRating: 0,
                status: 'CV_ONLY',
                available24_7: false,
                availableDays: false,
                availableNights: false,
                availableWeekends: false,
                availableImmediately: false,
                hasBSP: false,
                bspExpiryDate: null,
                hasDriverLicense: false,
                hasVehicle: false,
                vehicleType: null,
                hasRCR: false,
                experiences: [],
                languages: [],
                skills: []
            }));

            return res.json({
                data: mappedProspects,
                total: mappedProspects.length,
                city: city as string,
            });
        }

        // Default logic for Evaluated Candidates
        const isEvaluated = mode === 'evaluated' || !mode;

        // Build filter
        const where: any = {
            city: { contains: city as string, mode: 'insensitive' },
            isActive: true,
            isDeleted: false,
            isArchived: false,
        };

        // Only for evaluated candidates (Candidate table)
        if (isEvaluated) {
            where.status = {
                in: ['QUALIFIE', 'BON', 'TRES_BON', 'EXCELLENT', 'ELITE'],
            };
        }

        if (minRating) {
            where.globalRating = { gte: Number(minRating) };
        }

        if (hasVehicle === 'true') {
            where.hasVehicle = true;
        }

        if (available24_7 === 'true') {
            where.available24_7 = true;
        }

        if (availableDays === 'true') {
            where.availableDays = true;
        }

        if (availableNights === 'true') {
            where.availableNights = true;
        }

        if (availableWeekends === 'true') {
            where.availableWeekends = true;
        }

        // Query candidates from the same table but with different filters
        const candidates = await prisma.candidate.findMany({
            where,
            select: {
                id: true,
                firstName: true,
                city: true,
                province: true,
                globalRating: true,
                status: true,
                available24_7: true,
                availableDays: true,
                availableNights: true,
                availableWeekends: true,
                availableImmediately: true,
                hasBSP: true,
                bspExpiryDate: true,
                hasDriverLicense: true,
                hasVehicle: true,
                vehicleType: true,
                hasRCR: true,
                experiences: {
                    select: {
                        position: true,
                        companyName: true,
                        durationMonths: true,
                        isCurrent: true,
                    },
                    orderBy: { startDate: 'desc' },
                    take: 2,
                },
                languages: {
                    select: {
                        language: true,
                        level: true,
                    },
                },
                skills: {
                    select: {
                        level: true,
                        skill: {
                            select: {
                                name: true,
                                category: true,
                            },
                        },
                    },
                    take: 5,
                },
            },
            orderBy: { globalRating: 'desc' },
            take: 50,
        });

        res.json({
            data: candidates,
            total: candidates.length,
            city: city as string,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get list of cities with available candidates
 */
export const getAvailableCities = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const cities = await prisma.candidate.groupBy({
            by: ['city', 'province'],
            where: {
                isActive: true,
                isDeleted: false,
                isArchived: false,
                status: {
                    in: ['QUALIFIE', 'BON', 'TRES_BON', 'EXCELLENT', 'ELITE'],
                },
            },
            _count: {
                id: true,
            },
            orderBy: {
                _count: {
                    id: 'desc',
                },
            },
        });

        res.json({
            data: cities.map((c) => ({
                city: c.city,
                province: c.province,
                count: c._count.id,
            })),
        });
    } catch (error) {
        next(error);
    }
};
