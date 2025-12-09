import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { getCache, setCache, deleteCache } from '../config/cache';

const CLIENT_DETAIL_CACHE_PREFIX = 'clients:detail';

// Helper to invalidate client cache when contacts change
const invalidateClientCache = async (clientId: string) => {
    await deleteCache(`${CLIENT_DETAIL_CACHE_PREFIX}:${clientId}`);
};

/**
 * Get all contacts for a specific client
 */
export const getClientContacts = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { clientId } = req.params;

        const contacts = await prisma.contact.findMany({
            where: {
                clientId,
                isActive: true
            },
            orderBy: {
                isPrimary: 'desc', // Primary contacts first
            },
        });

        res.json({ data: contacts });
    } catch (error) {
        next(error);
    }
};

/**
 * Create a new contact
 */
export const createContact = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { clientId } = req.params;
        const {
            firstName,
            lastName,
            role,
            email,
            phone,
            isPrimary,
            notes
        } = req.body;
        const userId = req.user!.id;

        // If making this contact primary, unset other key contacts
        if (isPrimary) {
            await prisma.contact.updateMany({
                where: { clientId, isPrimary: true },
                data: { isPrimary: false }
            });
        }

        const contact = await prisma.contact.create({
            data: {
                clientId,
                firstName,
                lastName,
                role,
                email,
                phone,
                isPrimary: isPrimary || false,
                notes
            }
        });

        // Audit log
        await prisma.auditLog.create({
            data: {
                userId,
                action: 'CREATE',
                resource: 'Contact',
                resourceId: contact.id,
                details: `Contact créé: ${firstName} ${lastName} pour client ${clientId}`,
            },
        });

        await invalidateClientCache(clientId);

        res.status(201).json({
            message: 'Contact créé avec succès',
            data: contact
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update a contact
 */
export const updateContact = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { id, clientId } = req.params;
        const updateData = req.body;
        const userId = req.user!.id;

        // Verify contact belongs to client
        const existingContact = await prisma.contact.findFirst({
            where: { id, clientId }
        });

        if (!existingContact) {
            return res.status(404).json({ error: 'Contact non trouvé' });
        }

        // Handle primary contact switch
        if (updateData.isPrimary) {
            await prisma.contact.updateMany({
                where: { clientId, isPrimary: true, id: { not: id } },
                data: { isPrimary: false }
            });
        }

        const contact = await prisma.contact.update({
            where: { id },
            data: updateData
        });

        // Audit log
        await prisma.auditLog.create({
            data: {
                userId,
                action: 'UPDATE',
                resource: 'Contact',
                resourceId: id,
                details: `Contact mis à jour: ${contact.firstName} ${contact.lastName}`,
            },
        });

        await invalidateClientCache(clientId);

        res.json({
            message: 'Contact mis à jour avec succès',
            data: contact
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete (soft delete) a contact
 */
export const deleteContact = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { id, clientId } = req.params;
        const userId = req.user!.id;

        const contact = await prisma.contact.update({
            where: { id },
            data: { isActive: false }
        });

        // Audit log
        await prisma.auditLog.create({
            data: {
                userId,
                action: 'DELETE',
                resource: 'Contact',
                resourceId: id,
                details: `Contact désactivé: ${contact.firstName} ${contact.lastName}`,
            },
        });

        await invalidateClientCache(clientId);

        res.json({ message: 'Contact désactivé avec succès' });
    } catch (error) {
        next(error);
    }
};
