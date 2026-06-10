import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.middleware';
import { authenticateStaff } from '../middleware/auth';
import {
  getAllSkills,
  getSkillById,
  createSkill,
  updateSkill,
  deleteSkill,
  getSkillsStats,
  getCandidateSkills,
  addCandidateSkill,
  updateCandidateSkill,
  removeCandidateSkill,
  searchCandidatesBySkills,
  extractSkillsFromCandidate,
  getExtractionLogs,
  batchExtractSkills,
  extractSkillsWithAI,
  extractSkillsHybrid,
  getAIExtractionStats,
  searchExtractedSkills,
  getProspectSkillsDistribution,
} from '../controllers/skills.controller';

const router = Router();

// ============================================
// VALIDATION SCHEMAS
// ============================================

const createSkillSchema = {
  body: z.object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
    category: z.enum([
      'TECHNICAL',
      'SOFT_SKILL',
      'CERTIFICATION',
      'LANGUAGE',
      'INDUSTRY',
      'TOOL_EQUIPMENT',
      'OTHER',
    ]),
    description: z.string().optional(),
    keywords: z.array(z.string()).min(1, 'Au moins un mot-clé est requis'),
  }),
};

const updateSkillSchema = {
  body: z.object({
    name: z.string().min(2).optional(),
    category: z
      .enum([
        'TECHNICAL',
        'SOFT_SKILL',
        'CERTIFICATION',
        'LANGUAGE',
        'INDUSTRY',
        'TOOL_EQUIPMENT',
        'OTHER',
      ])
      .optional(),
    description: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  }),
};

const addCandidateSkillSchema = {
  body: z.object({
    skillId: z.string().uuid('ID de compétence invalide'),
    level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT', 'UNKNOWN']).optional(),
    yearsExperience: z.number().int().min(0).max(50).optional(),
    extractedText: z.string().optional(),
    source: z.enum(['REGEX_EXTRACTED', 'AI_EXTRACTED', 'MANUAL_ENTRY', 'HUMAN_VERIFIED']).optional(),
    confidence: z.number().min(0).max(1).optional(),
  }),
};

const updateCandidateSkillSchema = {
  body: z.object({
    level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT', 'UNKNOWN']).optional(),
    yearsExperience: z.number().int().min(0).max(50).optional(),
    isVerified: z.boolean().optional(),
    verifiedBy: z.string().uuid().optional(),
    rejectionNote: z.string().optional(),
  }),
};

const searchCandidatesSchema = {
  body: z.object({
    skillIds: z.array(z.string().uuid()).min(1, 'Au moins une compétence est requise'),
    level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT', 'UNKNOWN']).optional(),
    minYearsExperience: z.number().int().min(0).optional(),
    onlyVerified: z.boolean().optional(),
  }),
};

// ============================================
// SKILLS ROUTES
// ============================================

// Get skills stats (must be before /:id route)
router.get('/prospect-stats', authenticateStaff, getProspectSkillsDistribution);
router.get('/stats', authenticateStaff, getSkillsStats);

// Search extracted skills
router.get('/search', authenticateStaff, searchExtractedSkills);

// CRUD operations
router.get('/', authenticateStaff, getAllSkills);
router.get('/:id', authenticateStaff, getSkillById);
router.post('/', authenticateStaff, validate(createSkillSchema), createSkill);
router.put('/:id', authenticateStaff, validate(updateSkillSchema), updateSkill);
router.delete('/:id', authenticateStaff, deleteSkill);

// Search candidates by skills
router.post('/search-candidates', authenticateStaff, validate(searchCandidatesSchema), searchCandidatesBySkills);

// ============================================
// CANDIDATE SKILLS ROUTES
// ============================================

// Candidate-specific skill management
router.get('/candidates/:candidateId/skills', authenticateStaff, getCandidateSkills);
router.post(
  '/candidates/:candidateId/skills',
  authenticateStaff,
  validate(addCandidateSkillSchema),
  addCandidateSkill
);
router.put(
  '/candidates/:candidateId/skills/:skillId',
  authenticateStaff,
  validate(updateCandidateSkillSchema),
  updateCandidateSkill
);
router.delete('/candidates/:candidateId/skills/:skillId', authenticateStaff, removeCandidateSkill);

// ============================================
// EXTRACTION ROUTES
// ============================================

const extractSkillsSchema = {
  body: z.object({
    overwrite: z.boolean().optional(),
  }),
};

const batchExtractSchema = {
  body: z.object({
    candidateIds: z.array(z.string().uuid()).min(1, 'Au moins un candidat est requis'),
    model: z.string().optional(),
    overwrite: z.boolean().optional(),
  }),
};

// Batch extract (MUST be before /extract/:candidateId to avoid route conflict)
router.post('/extract/batch', authenticateStaff, validate(batchExtractSchema), batchExtractSkills);

// Extract skills from candidate
router.post('/extract/:candidateId', authenticateStaff, validate(extractSkillsSchema), extractSkillsFromCandidate);

// Get extraction logs
router.get('/extract/:candidateId/logs', authenticateStaff, getExtractionLogs);

// ============================================
// AI EXTRACTION ROUTES
// ============================================

const aiExtractionSchema = {
  body: z.object({
    provider: z.enum(['openai', 'claude']).optional(),
    model: z.string().optional(),
    overwrite: z.boolean().optional(),
  }),
};

// AI extraction
router.post('/extract/:candidateId/ai', authenticateStaff, validate(aiExtractionSchema), extractSkillsWithAI);

// Hybrid extraction (Regex + AI)
router.post('/extract/:candidateId/hybrid', authenticateStaff, validate(aiExtractionSchema), extractSkillsHybrid);

// AI stats
router.get('/extract/ai/stats', authenticateStaff, getAIExtractionStats);

export default router;

