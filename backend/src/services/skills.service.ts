import { PrismaClient } from '@prisma/client';
import { cvExtractionService } from './cv-extraction.service';
import { aiExtractionService } from './ai-extraction.service';

const prisma = new PrismaClient();

interface BatchProcessOptions {
    model?: string;
    overwrite?: boolean;
    concurrencyLimit?: number;
}

interface CandidateProcessResult {
    candidateId: string;
    name: string;
    success: boolean;
    skillsFound?: any;
    skillsCount?: number;
    skills?: any[];
    skipped?: boolean;
    reason?: string;
    saved?: any;
    isProspect?: boolean;
    error?: string;
}

interface BatchProcessResult {
    results: CandidateProcessResult[];
    summary: {
        total: number;
        success: number;
        failed: number;
        skipped: number;
        processed: number;
        totalSkillsExtracted: number;
    };
}

interface CandidateInfo {
    name: string;
    isProspect: boolean;
    exists: boolean;
}

/**
 * Service for managing skills extraction and batch processing operations
 */
export class SkillsService {
    /**
     * Get candidate or prospect information
     */
    async getCandidateInfo(candidateId: string): Promise<CandidateInfo> {
        // Try to find as candidate first
        const candidate = await prisma.candidate.findUnique({
            where: { id: candidateId },
            select: { firstName: true, lastName: true },
        });

        if (candidate) {
            const name = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Inconnu';
            return { name, isProspect: false, exists: true };
        }

        // Try to find as prospect
        const prospect = await prisma.prospectCandidate.findUnique({
            where: { id: candidateId },
            select: { firstName: true, lastName: true },
        });

        if (prospect) {
            const name = `${prospect.firstName || ''} ${prospect.lastName || ''}`.trim() || 'Inconnu';
            return { name, isProspect: true, exists: true };
        }

        return { name: 'Inconnu', isProspect: false, exists: false };
    }

    /**
     * Check if candidate has already been processed
     */
    async checkExistingExtraction(candidateId: string): Promise<{ isProcessed: boolean; skillsCount: number; skillsFound?: any }> {
        const existingLog = await prisma.cvExtractionLog.findFirst({
            where: {
                candidateId,
                success: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        if (existingLog) {
            // Verify if skills were actually saved
            const savedSkillsCount = await prisma.candidateSkill.count({
                where: { candidateId },
            });

            // Only consider processed if we have both a success log AND actual saved skills
            if (savedSkillsCount > 0) {
                return {
                    isProcessed: true,
                    skillsCount: savedSkillsCount,
                    skillsFound: existingLog.skillsFound,
                };
            }
        }

        return { isProcessed: false, skillsCount: 0 };
    }

    /**
     * Validate CV text meets minimum requirements
     */
    validateCVText(cvText: string | null): { isValid: boolean; error?: string } {
        if (!cvText || cvText.length < 50) {
            return {
                isValid: false,
                error: 'CV insuffisant (moins de 50 caractères)',
            };
        }
        return { isValid: true };
    }

    /**
     * Save extracted skills for a candidate or prospect
     */
    async saveSkillsForCandidate(
        candidateId: string,
        skills: any[],
        isProspect: boolean,
        overwrite: boolean
    ): Promise<any> {
        try {
            if (isProspect) {
                return await cvExtractionService.saveProspectSkills(
                    candidateId,
                    skills,
                    overwrite
                );
            } else {
                return await cvExtractionService.saveExtractedSkills(
                    candidateId,
                    skills,
                    overwrite
                );
            }
        } catch (saveError: any) {
            console.error(`Error saving skills for ${candidateId}:`, saveError);
            return { error: saveError.message };
        }
    }

    /**
     * Process a single candidate for skills extraction
     */
    async processSingleCandidate(
        candidateId: string,
        options: BatchProcessOptions
    ): Promise<CandidateProcessResult> {
        try {
            const { model, overwrite = false } = options;

            // Get candidate/prospect information
            const candidateInfo = await this.getCandidateInfo(candidateId);

            if (!candidateInfo.exists) {
                return {
                    candidateId,
                    name: candidateInfo.name,
                    success: false,
                    error: 'Candidat ou prospect non trouvé',
                };
            }

            // Check if already processed (skip if found and not overwriting)
            if (!overwrite) {
                const existingExtraction = await this.checkExistingExtraction(candidateId);
                if (existingExtraction.isProcessed) {
                    return {
                        candidateId,
                        name: candidateInfo.name,
                        success: true,
                        skillsFound: existingExtraction.skillsFound,
                        skillsCount: existingExtraction.skillsCount,
                        skipped: true,
                        reason: 'Déjà traité',
                    };
                }
            }

            // Get candidate/prospect CV text
            const cvText = await cvExtractionService.getCandidateText(
                candidateId,
                candidateInfo.isProspect
            );

            // Validate CV text
            const validation = this.validateCVText(cvText);
            if (!validation.isValid) {
                return {
                    candidateId,
                    name: candidateInfo.name,
                    success: false,
                    error: validation.error,
                };
            }

            // Extract skills - use AI if model provided, otherwise use regex
            let extraction;
            if (model) {
                extraction = await aiExtractionService.extractWithOpenAI(candidateId, cvText!, model as any);
            } else {
                extraction = await cvExtractionService.extractSkillsFromText(candidateId, cvText!);
            }

            if (!extraction.success) {
                return {
                    candidateId,
                    name: candidateInfo.name,
                    success: false,
                    error: extraction.errorMessage,
                };
            }

            // Save extracted skills
            const saveResult = await this.saveSkillsForCandidate(
                candidateId,
                extraction.skillsFound,
                candidateInfo.isProspect,
                overwrite
            );

            return {
                candidateId,
                name: candidateInfo.name,
                success: true,
                skillsCount: extraction.totalSkills,
                skills: extraction.skillsFound,
                saved: saveResult,
                isProspect: candidateInfo.isProspect,
            };
        } catch (error: any) {
            return {
                candidateId,
                name: 'Erreur',
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Process multiple candidates in batches with concurrency control
     */
    async batchProcessCandidates(
        candidateIds: string[],
        options: BatchProcessOptions = {}
    ): Promise<BatchProcessResult> {
        const { concurrencyLimit = 5 } = options;

        // Process in chunks to limit concurrency
        const results: CandidateProcessResult[] = [];

        for (let i = 0; i < candidateIds.length; i += concurrencyLimit) {
            const chunk = candidateIds.slice(i, i + concurrencyLimit);
            const chunkResults = await Promise.all(
                chunk.map((id) => this.processSingleCandidate(id, options))
            );
            results.push(...chunkResults);
        }

        // Calculate summary statistics
        const successCount = results.filter((r) => r.success).length;
        const skippedCount = results.filter((r) => r.skipped).length;
        const processedCount = successCount - skippedCount;
        const totalSkills = results.reduce((sum, r) => sum + (r.skillsCount || 0), 0);

        return {
            results,
            summary: {
                total: candidateIds.length,
                success: successCount,
                failed: candidateIds.length - successCount,
                skipped: skippedCount,
                processed: processedCount,
                totalSkillsExtracted: totalSkills,
            },
        };
    }
}

// Export singleton instance
export const skillsService = new SkillsService();
