import { Request, Response, NextFunction } from 'express';
import { PrismaClient, SkillCategory, SkillLevel, SkillSource } from '@prisma/client';
import { cvExtractionService } from '../services/cv-extraction.service';
import { buildExtractedSkillsFilters, fetchExtractedSkillsResults } from '../services/skill-search.service';
import { aiExtractionService } from '../services/ai-extraction.service';

const prisma = new PrismaClient();

// ============================================
// SKILLS MANAGEMENT (CRUD)
// ============================================

/**
 * Get all skills with optional filters
 * GET /api/skills
 * Query params: category, isActive, search
 */
export const getAllSkills = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, isActive, search } = req.query;

    const where: any = {};

    if (category) {
      where.category = category as SkillCategory;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
        { keywords: { has: (search as string).toLowerCase() } },
      ];
    }

    const skills = await prisma.skill.findMany({
      where,
      include: {
        _count: {
          select: { candidateSkills: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      skills,
      count: skills.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single skill by ID
 * GET /api/skills/:id
 */
export const getSkillById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const skill = await prisma.skill.findUnique({
      where: { id },
      include: {
        candidateSkills: {
          include: {
            candidate: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                city: true,
              },
            },
          },
        },
        _count: {
          select: { candidateSkills: true },
        },
      },
    });

    if (!skill) {
      return res.status(404).json({ error: 'CompÃ©tence non trouvÃ©e' });
    }

    res.json({ skill });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new skill
 * POST /api/skills
 * Body: { name, category, description?, keywords[] }
 */
export const createSkill = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, category, description, keywords } = req.body;

    // Check if skill already exists
    const existing = await prisma.skill.findUnique({
      where: { name },
    });

    if (existing) {
      return res.status(400).json({ error: 'Une compÃ©tence avec ce nom existe dÃ©jÃ ' });
    }

    const skill = await prisma.skill.create({
      data: {
        name,
        category: category as SkillCategory,
        description,
        keywords: keywords || [],
        isActive: true,
      },
    });

    res.status(201).json({
      message: 'CompÃ©tence crÃ©Ã©e avec succÃ¨s',
      skill,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a skill
 * PUT /api/skills/:id
 * Body: { name?, category?, description?, keywords?, isActive? }
 */
export const updateSkill = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, category, description, keywords, isActive } = req.body;

    // Check if skill exists
    const existing = await prisma.skill.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'CompÃ©tence non trouvÃ©e' });
    }

    // If changing name, check for duplicates
    if (name && name !== existing.name) {
      const duplicate = await prisma.skill.findUnique({
        where: { name },
      });

      if (duplicate) {
        return res.status(400).json({ error: 'Une compÃ©tence avec ce nom existe dÃ©jÃ ' });
      }
    }

    const skill = await prisma.skill.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(category && { category: category as SkillCategory }),
        ...(description !== undefined && { description }),
        ...(keywords && { keywords }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json({
      message: 'CompÃ©tence mise Ã  jour',
      skill,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a skill (soft delete by setting isActive = false)
 * DELETE /api/skills/:id
 */
export const deleteSkill = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const skill = await prisma.skill.findUnique({
      where: { id },
      include: {
        _count: {
          select: { candidateSkills: true },
        },
      },
    });

    if (!skill) {
      return res.status(404).json({ error: 'CompÃ©tence non trouvÃ©e' });
    }

    // Soft delete - just mark as inactive
    const updated = await prisma.skill.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({
      message: `CompÃ©tence dÃ©sactivÃ©e (${skill._count.candidateSkills} candidat(s) affectÃ©(s))`,
      skill: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get skills statistics
 * GET /api/skills/stats
 */
export const getSkillsStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [totalSkills, activeSkills, candidateSkills, skillsByCategory] = await Promise.all([
      prisma.skill.count(),
      prisma.skill.count({ where: { isActive: true } }),
      prisma.candidateSkill.count(),
      prisma.skill.groupBy({
        by: ['category'],
        _count: true,
        orderBy: { _count: { category: 'desc' } },
      }),
    ]);

    // Get most common skills
    const topSkills = await prisma.candidateSkill.groupBy({
      by: ['skillId'],
      _count: true,
      orderBy: { _count: { skillId: 'desc' } },
      take: 10,
    });

    // Fetch skill names for top skills
    const topSkillsWithNames = await Promise.all(
      topSkills.map(async (ts) => {
        const skill = await prisma.skill.findUnique({
          where: { id: ts.skillId },
          select: { id: true, name: true, category: true },
        });
        return {
          ...skill,
          count: ts._count,
        };
      })
    );

    res.json({
      stats: {
        totalSkills,
        activeSkills,
        inactiveSkills: totalSkills - activeSkills,
        totalCandidateSkills: candidateSkills,
        averageSkillsPerCandidate: candidateSkills / (await prisma.candidate.count()) || 0,
      },
      skillsByCategory,
      topSkills: topSkillsWithNames,
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// CANDIDATE SKILLS MANAGEMENT
// ============================================

/**
 * Get all skills for a candidate
 * GET /api/candidates/:candidateId/skills
 */
export const getCandidateSkills = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { candidateId } = req.params;

    const candidateSkills = await prisma.candidateSkill.findMany({
      where: { candidateId },
      include: {
        skill: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      candidateSkills,
      count: candidateSkills.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a skill to a candidate
 * POST /api/candidates/:candidateId/skills
 * Body: { skillId, level?, yearsExperience?, extractedText?, source?, confidence? }
 */
export const addCandidateSkill = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { candidateId } = req.params;
    const { skillId, level, yearsExperience, extractedText, source, confidence } = req.body;

    // Check if candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      return res.status(404).json({ error: 'Candidat non trouvÃ©' });
    }

    // Check if skill exists
    const skill = await prisma.skill.findUnique({
      where: { id: skillId },
    });

    if (!skill) {
      return res.status(404).json({ error: 'CompÃ©tence non trouvÃ©e' });
    }

    // Check if candidate already has this skill
    const existing = await prisma.candidateSkill.findUnique({
      where: {
        candidateId_skillId: {
          candidateId,
          skillId,
        },
      },
    });

    if (existing) {
      return res.status(400).json({ error: 'Le candidat possÃ¨de dÃ©jÃ  cette compÃ©tence' });
    }

    const candidateSkill = await prisma.candidateSkill.create({
      data: {
        candidateId,
        skillId,
        level: (level as SkillLevel) || 'UNKNOWN',
        yearsExperience,
        extractedText,
        source: (source as SkillSource) || 'MANUAL_ENTRY',
        confidence,
        isVerified: source === 'MANUAL_ENTRY' || source === 'HUMAN_VERIFIED',
      },
      include: {
        skill: true,
      },
    });

    res.status(201).json({
      message: 'CompÃ©tence ajoutÃ©e au candidat',
      candidateSkill,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a candidate's skill (level, verification, etc.)
 * PUT /api/candidates/:candidateId/skills/:skillId
 * Body: { level?, yearsExperience?, isVerified?, verifiedBy?, rejectionNote? }
 */
export const updateCandidateSkill = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { candidateId, skillId } = req.params;
    const { level, yearsExperience, isVerified, verifiedBy, rejectionNote } = req.body;

    const candidateSkill = await prisma.candidateSkill.findUnique({
      where: {
        candidateId_skillId: {
          candidateId,
          skillId,
        },
      },
    });

    if (!candidateSkill) {
      return res.status(404).json({ error: 'CompÃ©tence non trouvÃ©e pour ce candidat' });
    }

    const updated = await prisma.candidateSkill.update({
      where: {
        candidateId_skillId: {
          candidateId,
          skillId,
        },
      },
      data: {
        ...(level && { level: level as SkillLevel }),
        ...(yearsExperience !== undefined && { yearsExperience }),
        ...(isVerified !== undefined && { isVerified }),
        ...(verifiedBy && { verifiedBy, verifiedAt: new Date() }),
        ...(rejectionNote !== undefined && { rejectionNote }),
        ...(isVerified && { source: 'HUMAN_VERIFIED' }),
      },
      include: {
        skill: true,
      },
    });

    res.json({
      message: 'CompÃ©tence mise Ã  jour',
      candidateSkill: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove a skill from a candidate
 * DELETE /api/candidates/:candidateId/skills/:skillId
 */
export const removeCandidateSkill = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { candidateId, skillId } = req.params;

    const candidateSkill = await prisma.candidateSkill.findUnique({
      where: {
        candidateId_skillId: {
          candidateId,
          skillId,
        },
      },
    });

    if (!candidateSkill) {
      return res.status(404).json({ error: 'CompÃ©tence non trouvÃ©e pour ce candidat' });
    }

    await prisma.candidateSkill.delete({
      where: {
        candidateId_skillId: {
          candidateId,
          skillId,
        },
      },
    });

    res.json({
      message: 'CompÃ©tence retirÃ©e du candidat',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Search candidates by skills
 * POST /api/skills/search-candidates
 * Body: { skillIds[], level?, minYearsExperience?, onlyVerified? }
 */
export const searchCandidatesBySkills = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { skillIds, level, minYearsExperience, onlyVerified } = req.body;

    if (!skillIds || skillIds.length === 0) {
      return res.status(400).json({ error: 'Au moins une compÃ©tence est requise' });
    }

    const where: any = {
      skillId: { in: skillIds },
    };

    if (level) {
      where.level = level as SkillLevel;
    }

    if (minYearsExperience !== undefined) {
      where.yearsExperience = { gte: minYearsExperience };
    }

    if (onlyVerified) {
      where.isVerified = true;
    }

    const candidateSkills = await prisma.candidateSkill.findMany({
      where,
      include: {
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            city: true,
            province: true,
            status: true,
            globalRating: true,
            isActive: true,
          },
        },
        skill: true,
      },
    });

    // Group by candidate
    const candidateMap = new Map();

    candidateSkills.forEach((cs) => {
      if (!candidateMap.has(cs.candidateId)) {
        candidateMap.set(cs.candidateId, {
          candidate: cs.candidate,
          skills: [],
        });
      }
      candidateMap.get(cs.candidateId).skills.push({
        skill: cs.skill,
        level: cs.level,
        yearsExperience: cs.yearsExperience,
        isVerified: cs.isVerified,
      });
    });

    const results = Array.from(candidateMap.values());

    res.json({
      results,
      count: results.length,
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// CV EXTRACTION
// ============================================

/**
 * Extract skills from a candidate's CV
 * POST /api/skills/extract/:candidateId
 * Body: { overwrite? }
 */
export const extractSkillsFromCandidate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { candidateId } = req.params;
    const { overwrite = false, model } = req.body;

    // Check if candidate exists (try both tables)
    let candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    let isProspect = false;
    if (!candidate) {
      // Try prospect_candidates table
      const prospect = await prisma.prospectCandidate.findUnique({
        where: { id: candidateId },
      });

      if (!prospect) {
        return res.status(404).json({ error: 'Candidat ou prospect non trouvÃ©' });
      }
      isProspect = true;
    }

    // Get candidate/prospect text
    const cvText = await cvExtractionService.getCandidateText(candidateId, isProspect);

    if (!cvText || cvText.length < 50) {
      return res.status(400).json({
        error: 'CV insuffisant',
        message: "Le CV doit contenir au moins 50 caractÃ¨res pour l'extraction",
      });
    }

    // Extract skills - use AI if model is provided, otherwise use regex
    let extraction;
    if (model) {
      // AI extraction (OpenAI)
      extraction = await aiExtractionService.extractWithOpenAI(candidateId, cvText, model);
    } else {
      // Regex extraction
      extraction = await cvExtractionService.extractSkillsFromText(candidateId, cvText);
    }

    if (!extraction.success) {
      return res.status(500).json({
        error: 'Erreur lors de l\'extraction',
        message: extraction.errorMessage,
      });
    }

    // Save extracted skills (only for regular candidates, not prospects)
    let saveResult = null;
    if (!isProspect) {
      saveResult = await cvExtractionService.saveExtractedSkills(
        candidateId,
        extraction.skillsFound,
        overwrite
      );
    }

    // Return response in format expected by frontend
    res.json({
      success: true,
      candidateId,
      model: model || extraction.method,
      skillsFound: extraction.skillsFound,
      totalSkills: extraction.totalSkills,
      processingTimeMs: extraction.processingTimeMs,
      promptTokens: extraction.promptTokens || 0,
      completionTokens: extraction.completionTokens || 0,
      totalCost: extraction.totalCost || 0,
      saved: saveResult,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get extraction logs for a candidate
 * GET /api/skills/extract/:candidateId/logs
 */
export const getExtractionLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { candidateId } = req.params;

    const logs = await prisma.cvExtractionLog.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      logs,
      count: logs.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Batch extract skills from multiple candidates/prospects
 * POST /api/skills/extract/batch
 * Body: { candidateIds[], model?, overwrite? }
 */
export const batchExtractSkills = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { candidateIds, model, overwrite = false } = req.body;
    const userId = req.user!.id; // Get user ID for prospect conversion

    if (!candidateIds || candidateIds.length === 0) {
      return res.status(400).json({ error: 'Au moins un candidat est requis' });
    }

    const results = [];

    for (const candidateId of candidateIds) {
      try {
        // Check if already processed (skip if found in extraction log with success)
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
          results.push({
            candidateId,
            success: true,
            skillsFound: existingLog.skillsFound,
            skipped: true,
            reason: 'DÃ©jÃ  traitÃ©',
          });
          continue;
        }

        // Check if candidate or prospect exists
        let candidate = await prisma.candidate.findUnique({
          where: { id: candidateId },
        });

        let isProspect = false;
        if (!candidate) {
          const prospect = await prisma.prospectCandidate.findUnique({
            where: { id: candidateId },
          });

          if (!prospect) {
            results.push({
              candidateId,
              success: false,
              error: 'Candidat ou prospect non trouvÃ©',
            });
            continue;
          }
          isProspect = true;
        }

        // Get candidate/prospect text
        const cvText = await cvExtractionService.getCandidateText(candidateId, isProspect);

        if (!cvText || cvText.length < 50) {
          results.push({
            candidateId,
            success: false,
            error: 'CV insuffisant (moins de 50 caractÃ¨res)',
          });
          continue;
        }

        // Extract skills - use AI if model provided, otherwise use regex
        let extraction;
        if (model) {
          extraction = await aiExtractionService.extractWithOpenAI(candidateId, cvText, model);
        } else {
          extraction = await cvExtractionService.extractSkillsFromText(candidateId, cvText);
        }

        if (extraction.success) {
          // Save skills for both candidates AND prospects
          let saveResult = null;
          try {
            saveResult = await cvExtractionService.saveExtractedSkills(
              candidateId,
              extraction.skillsFound,
              overwrite,
              isProspect, // Pass isProspect flag to save service
              userId // Pass userId for prospect conversion
            );
          } catch (saveError: any) {
            console.error(`Error saving skills for ${candidateId}:`, saveError);
            saveResult = { error: saveError.message };
          }

          results.push({
            candidateId,
            success: true,
            skillsFound: extraction.totalSkills,
            saved: saveResult,
            isProspect,
          });
        } else {
          results.push({
            candidateId,
            success: false,
            error: extraction.errorMessage,
          });
        }
      } catch (error: any) {
        results.push({
          candidateId,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const skippedCount = results.filter((r) => r.skipped).length;
    const processedCount = successCount - skippedCount;
    const totalSkills = results.reduce((sum, r) => sum + (r.skillsFound || 0), 0);

    res.json({
      message: `Extraction batch terminÃ©e: ${successCount}/${candidateIds.length} rÃ©ussies (${skippedCount} dÃ©jÃ  traitÃ©s, ${processedCount} nouveaux)`,
      results,
      summary: {
        total: candidateIds.length,
        success: successCount,
        failed: candidateIds.length - successCount,
        skipped: skippedCount,
        processed: processedCount,
        totalSkillsExtracted: totalSkills,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// AI EXTRACTION
// ============================================

/**
 * Extract skills using AI (OpenAI or Claude)
 * POST /api/skills/extract/:candidateId/ai
 * Body: { provider: 'openai'|'claude', model?, overwrite? }
 */
export const extractSkillsWithAI = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { candidateId } = req.params;
    const { provider = 'openai', model, overwrite = false } = req.body;

    // Check if candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      return res.status(404).json({ error: 'Candidat non trouvÃ©' });
    }

    // Get candidate text
    const cvText = await cvExtractionService.getCandidateText(candidateId);

    if (!cvText || cvText.length < 50) {
      return res.status(400).json({
        error: 'CV insuffisant',
        message: "Le CV doit contenir au moins 50 caractÃ¨res pour l'extraction AI",
      });
    }

    // Extract with AI
    let extraction;
    if (provider === 'claude') {
      extraction = await aiExtractionService.extractWithClaude(candidateId, cvText, model);
    } else {
      extraction = await aiExtractionService.extractWithOpenAI(candidateId, cvText, model);
    }

    if (!extraction.success) {
      return res.status(500).json({
        error: "Erreur lors de l'extraction AI",
        message: extraction.errorMessage,
      });
    }

    // Save extracted skills
    const saveResult = await cvExtractionService.saveExtractedSkills(
      candidateId,
      extraction.skillsFound,
      overwrite
    );

    res.json({
      message: 'Extraction AI terminÃ©e',
      extraction: {
        provider: extraction.method,
        model: extraction.model,
        totalFound: extraction.totalSkills,
        processingTimeMs: extraction.processingTimeMs,
        promptTokens: extraction.promptTokens,
        completionTokens: extraction.completionTokens,
        totalTokens: extraction.promptTokens + extraction.completionTokens,
        estimatedCost: `$${extraction.totalCost.toFixed(4)}`,
      },
      saved: saveResult,
      skills: extraction.skillsFound.map((s) => ({
        skillId: s.skillId,
        name: s.skillName,
        level: s.level,
        confidence: s.confidence,
        yearsExperience: s.yearsExperience,
        reasoning: s.reasoning,
        isSecurityRelated: s.isSecurityRelated,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Extract skills with hybrid approach (Regex + AI)
 * POST /api/skills/extract/:candidateId/hybrid
 * Body: { provider?, model?, overwrite? }
 */
export const extractSkillsHybrid = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { candidateId } = req.params;
    const { provider = 'openai', model, overwrite = false } = req.body;

    // Check if candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      return res.status(404).json({ error: 'Candidat non trouvÃ©' });
    }

    // Get candidate text
    const cvText = await cvExtractionService.getCandidateText(candidateId);

    // Step 1: Extract with Regex (fast, cheap)
    const regexExtraction = await cvExtractionService.extractSkillsFromText(candidateId, cvText);

    // Step 2: Extract with AI (smart, expensive)
    let aiExtraction;
    if (provider === 'claude') {
      aiExtraction = await aiExtractionService.extractWithClaude(candidateId, cvText, model);
    } else {
      aiExtraction = await aiExtractionService.extractWithOpenAI(candidateId, cvText, model);
    }

    // Merge results (prefer AI confidence if higher)
    const mergedSkills = new Map();

    // Add regex results
    for (const skill of regexExtraction.skillsFound) {
      mergedSkills.set(skill.skillId, {
        ...skill,
        source: 'REGEX_EXTRACTED' as SkillSource,
      });
    }

    // Add/update with AI results (higher confidence)
    if (aiExtraction.success) {
      for (const skill of aiExtraction.skillsFound) {
        const existing = mergedSkills.get(skill.skillId);
        if (!existing || skill.confidence > existing.confidence) {
          mergedSkills.set(skill.skillId, {
            ...skill,
            source: 'AI_EXTRACTED' as SkillSource,
          });
        }
      }
    }

    const finalSkills = Array.from(mergedSkills.values());

    // Save all skills
    const saveResult = await cvExtractionService.saveExtractedSkills(
      candidateId,
      finalSkills,
      overwrite
    );

    res.json({
      message: 'Extraction hybride terminÃ©e',
      extraction: {
        regex: {
          found: regexExtraction.totalSkills,
          processingTimeMs: regexExtraction.processingTimeMs,
        },
        ai: {
          provider: aiExtraction.method,
          model: aiExtraction.model,
          found: aiExtraction.totalSkills,
          processingTimeMs: aiExtraction.processingTimeMs,
          tokens: aiExtraction.promptTokens + aiExtraction.completionTokens,
          cost: `$${aiExtraction.totalCost.toFixed(4)}`,
        },
        merged: {
          totalUnique: finalSkills.length,
          fromRegex: finalSkills.filter((s) => s.source === 'REGEX_EXTRACTED').length,
          fromAI: finalSkills.filter((s) => s.source === 'AI_EXTRACTED').length,
        },
      },
      saved: saveResult,
      skills: finalSkills.slice(0, 20).map((s) => ({
        // Limit to 20 for response
        skillId: s.skillId,
        name: s.skillName,
        level: s.level,
        confidence: s.confidence,
        source: s.source,
        yearsExperience: s.yearsExperience,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get AI extraction statistics
 * GET /api/skills/extract/ai/stats
 */
export const getAIExtractionStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await prisma.cvExtractionLog.findMany({
      where: {
        extractionMethod: { in: ['OPENAI', 'CLAUDE'] },
      },
    });

    const totalExtractions = logs.length;
    const successfulExtractions = logs.filter((l) => l.success).length;
    const totalCost = logs.reduce((sum, l) => sum + (l.totalCost || 0), 0);
    const totalTokens = logs.reduce(
      (sum, l) => sum + (l.promptTokens || 0) + (l.completionTokens || 0),
      0
    );
    const totalSkillsExtracted = logs.reduce((sum, l) => sum + l.skillsFound, 0);
    const avgProcessingTime =
      logs.reduce((sum, l) => sum + l.processingTimeMs, 0) / (logs.length || 1);

    // Group by method
    const byMethod = logs.reduce((acc, log) => {
      if (!acc[log.extractionMethod]) {
        acc[log.extractionMethod] = {
          count: 0,
          successful: 0,
          totalCost: 0,
          totalTokens: 0,
          skillsFound: 0,
        };
      }
      acc[log.extractionMethod].count++;
      if (log.success) acc[log.extractionMethod].successful++;
      acc[log.extractionMethod].totalCost += log.totalCost || 0;
      acc[log.extractionMethod].totalTokens +=
        (log.promptTokens || 0) + (log.completionTokens || 0);
      acc[log.extractionMethod].skillsFound += log.skillsFound;
      return acc;
    }, {} as any);

    res.json({
      stats: {
        totalExtractions,
        successfulExtractions,
        successRate: (successfulExtractions / (totalExtractions || 1)) * 100,
        totalCost: `$${totalCost.toFixed(4)}`,
        totalTokens,
        totalSkillsExtracted,
        avgSkillsPerExtraction: totalSkillsExtracted / (successfulExtractions || 1),
        avgProcessingTimeMs: Math.round(avgProcessingTime),
        avgCostPerExtraction: `$${(totalCost / (totalExtractions || 1)).toFixed(4)}`,
      },
      byMethod,
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SKILLS SEARCH & DISCOVERY
// ============================================

/**
 * Search extracted skills across all candidates and prospects
 * GET /api/skills/search
 * Query params: q (search term), category, minConfidence, limit
 */
export const searchExtractedSkills = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = buildExtractedSkillsFilters(req.query);
    const { results } = await fetchExtractedSkillsResults(filters);

    res.json({
      results,
      count: results.length,
      query: {
        searchTerm: filters.searchTerm || null,
        category: filters.category || null,
        minConfidence: filters.minConfidence ?? 0,
      },
    });
  } catch (error) {
    next(error);
  }
};
