import { Request, Response, NextFunction } from 'express';
import { aiExtractionService } from '../services/ai-extraction.service';
import { cvExtractionService } from '../services/cv-extraction.service';
import { prisma } from '../config/database';

/**
 * Extract skills for a candidate using AI
 */
export const extractCandidateSkills = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { model = 'gpt-3.5-turbo', method = 'OPENAI' } = req.body;

        // Verify candidate exists
        const candidate = await prisma.candidate.findUnique({
            where: { id },
        });

        if (!candidate) {
            return res.status(404).json({ error: 'Candidat non trouvé' });
        }

        // Get candidate CV text
        const cvText = await cvExtractionService.getCandidateText(id, false);
        if (!cvText || cvText.trim().length === 0) {
            return res.status(400).json({ error: 'Aucun texte trouvé dans le CV du candidat' });
        }

        // Extract skills
        let result;
        if (method === 'CLAUDE') {
            result = await aiExtractionService.extractWithClaude(id, cvText, model);
        } else {
            result = await aiExtractionService.extractWithOpenAI(id, cvText, model);
        }

        // Save skills if successful
        if (result.success && result.skillsFound.length > 0) {
            // Save to database
            // We cast to any because AIExtractionResult is compatible with ExtractionResult
            await cvExtractionService.saveExtractedSkills(id, result.skillsFound as any, true);
        }

        res.json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * Extract skills for a prospect using AI
 */
export const extractProspectSkills = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { model = 'gpt-3.5-turbo', method = 'OPENAI' } = req.body;

        // Verify prospect exists
        const prospect = await prisma.prospectCandidate.findUnique({
            where: { id },
        });

        if (!prospect) {
            return res.status(404).json({ error: 'Prospect non trouvé' });
        }

        // Get prospect CV text
        const cvText = await cvExtractionService.getCandidateText(id, true);
        if (!cvText || cvText.trim().length === 0) {
            return res.status(400).json({ error: 'Aucun texte trouvé dans le CV du prospect' });
        }

        // Extract skills
        let result;
        if (method === 'CLAUDE') {
            result = await aiExtractionService.extractWithClaude(id, cvText, model);
        } else {
            result = await aiExtractionService.extractWithOpenAI(id, cvText, model);
        }

        // Save skills if successful
        if (result.success && result.skillsFound.length > 0) {
            // Save to database
            await cvExtractionService.saveProspectSkills(id, result.skillsFound as any, true);
        }

        res.json(result);
    } catch (error) {
        next(error);
    }
};
