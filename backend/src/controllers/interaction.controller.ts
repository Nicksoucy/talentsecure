import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { getCache, deleteCache } from '../config/cache';

const CLIENT_DETAIL_CACHE_PREFIX = 'clients:detail';

// Helper to invalidate client cache when interactions change
const invalidateClientCache = async (clientId: string) => {
    await deleteCache(`${CLIENT_DETAIL_CACHE_PREFIX}:${clientId}`);
};

/**
 * Get all interactions for a specific client
 */
export const getClientInteractions = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { clientId } = req.params;

        const interactions = await prisma.interaction.findMany({
            where: { clientId },
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    }
                }
            }
        });

        res.json({ data: interactions });
    } catch (error) {
        next(error);
    }
};

/**
 * Create a new interaction
 */
export const createInteraction = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { clientId } = req.params;
        const {
            type,
            direction,
            subject,
            content,
        } = req.body;
        const userId = req.user!.id;

        const interaction = await prisma.interaction.create({
            data: {
                clientId,
                type,
                direction,
                subject,
                content,
                createdBy: userId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    }
                }
            }
        });

        // Audit log? Maybe overkill for every interaction, but good for traceability
        // Skipping separate AuditLog to avoid double writing, as Interaction itself is a log.

        await invalidateClientCache(clientId);

        res.status(201).json({
            message: 'Interaction enregistrée',
            data: interaction
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete interaction
 */
export const deleteInteraction = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { id, clientId } = req.params;

        await prisma.interaction.delete({
            where: { id }
        });

        await invalidateClientCache(clientId);

        res.json({ message: 'Interaction supprimée' });
    } catch (error) {
        next(error);
    }
};
