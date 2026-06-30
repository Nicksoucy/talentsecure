import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';

/**
 * GET /api/prospects/:id/analysis
 * Read the persisted AI analysis for a prospect (written by the
 * `/analyze-prospects` Claude Code slash command — no API key, no
 * server-side AI calls).
 */
export const getProspectAnalysis = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const analysis = await prisma.prospectAnalysis.findUnique({
            where: { prospectId: id },
        });
        if (!analysis) {
            throw new ApiError(404, 'Aucune analyse pour ce prospect');
        }
        res.json({ analysis });
    } catch (error) {
        next(error);
    }
};
