import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';

interface ClientJWTPayload {
    userId: string; // Changed from clientId to match login token
    email: string;
    role: string;
}

declare global {
    namespace Express {
        interface Request {
            client?: {
                id: string;
                email: string;
                name: string;
            };
        }
    }
}

/**
 * Middleware to authenticate client using JWT
 */
export const authenticateClient = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'Token manquant' });
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'your-secret-key'
        ) as ClientJWTPayload;

        // Verify it's a client token
        if (decoded.role !== 'CLIENT') {
            return res.status(401).json({ error: 'Token invalide' });
        }

        // Verify client exists and is active
        const client = await prisma.client.findUnique({
            where: { id: decoded.userId }, // Changed from clientId to userId
            select: {
                id: true,
                email: true,
                name: true,
                isActive: true,
            },
        });

        if (!client || !client.isActive) {
            return res.status(401).json({ error: 'Client non trouvé ou inactif' });
        }

        req.client = client;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
};
