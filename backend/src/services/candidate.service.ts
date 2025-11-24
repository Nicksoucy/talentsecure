import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

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
}

export const candidateService = new CandidateService();
