import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { prospectScoringService } from '../services/prospect-scoring.service';

/**
 * POST /api/prospects/:id/analyze
 * Analyze a single prospect's CV with Claude. Upserts ProspectAnalysis.
 */
export const analyzeProspect = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { force, model } = req.body || {};
        const result = await prospectScoringService.analyzeProspect(id, {
            force: !!force,
            model,
        });
        res.json({ analysis: result });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/prospects/analyze-batch
 * Analyze a set of prospects. With no body, defaults to "every un-analyzed
 * prospect, newest first, capped at limit". Use force=true to re-score
 * existing analyses (e.g. after bumping the rubric version).
 */
export const analyzeBatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { prospectIds, limit, force, model } = req.body || {};
        const result = await prospectScoringService.analyzeBatch({
            prospectIds,
            limit,
            force: !!force,
            model,
        });
        res.json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/prospects/:id/analysis
 * Read the persisted analysis for a prospect, if any.
 */
export const getProspectAnalysis = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const analysis = await prisma.prospectAnalysis.findUnique({
            where: { prospectId: id },
        });
        if (!analysis) {
            return res.status(404).json({ error: 'Aucune analyse pour ce prospect' });
        }
        res.json({ analysis });
    } catch (error) {
        next(error);
    }
};
