import { Router } from 'express';
import { z } from 'zod';
import {
  getCandidates,
  getCandidateById,
  createCandidate,
  updateCandidate,
  deleteCandidate,
  archiveCandidate,
  unarchiveCandidate,
  getCandidatesByCity,
  getCitiesSuggestions,
  getCandidatesSuggestions,
  initiateVideoUpload,
  completeVideoUpload,
  uploadCandidateVideo,
  getCandidateVideoUrl,
  deleteCandidateVideo,
  exportCandidatesCSV,
  advancedSearch,
  parseNaturalLanguageSearch,
  getSimilarCandidates,
  getCandidatesStats,
} from '../controllers/candidate.controller';
import {
  uploadCandidateCV,
  downloadCandidateCV,
  deleteCandidateCV,
} from '../controllers/upload.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';
import { createCandidateSchema, updateCandidateSchema, candidateFiltersSchema, candidateIdSchema } from '../validation/candidate.validation';
import { uploadCV } from '../middleware/upload';
import { videoUpload } from '../services/video.service';

// Validation schemas
const uuidParam = z.object({
  id: z.string().uuid('ID invalide'),
});

const candidateQueryFilters = z.object({
  search: z.string().max(200).optional(),
  status: z.string().optional(),
  minRating: z.string().optional(),
  city: z.string().max(100).optional(),
  hasBSP: z.string().optional(),
  hasVehicle: z.string().optional(),
  hasVideo: z.string().optional(),
  hasDriverLicense: z.string().optional(),
  hasCV: z.string().optional(),
  canWorkUrgent: z.string().optional(),
  maxTravelKm: z.string().optional(),
  bspStatus: z.string().optional(),
  interviewDateStart: z.string().optional(),
  interviewDateEnd: z.string().optional(),
  includeArchived: z.string().optional(),
  certification: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
}).strict();

// Advanced search validation schema (Phase 1)
const advancedSearchSchema = z.object({
  cities: z.array(z.string()).optional().default([]),
  certifications: z.array(z.string()).optional().default([]),
  availability: z.array(z.string()).optional().default([]),
  minExperience: z.number().min(0).optional(),
  minRating: z.number().min(0).max(10).optional(),
  hasVehicle: z.boolean().optional(),
  languages: z.array(z.string()).optional().default([]),
  skills: z.array(z.string()).optional().default([]),
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(20),
});

const router = Router();

// All candidate routes require authentication
router.use(authenticateJWT);

// --- Direct Video Upload Routes (Start) ---
/**
 * @route   POST /api/candidates/:id/video/initiate-upload
 * @desc    Get signed URL for direct video upload
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.post(
  '/:id/video/initiate-upload',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
  validate({ params: candidateIdSchema }),
  initiateVideoUpload
);

/**
 * @route   POST /api/candidates/:id/video/complete-upload
 * @desc    Confirm successful upload and update candidate
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.post(
  '/:id/video/complete-upload',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
  validate({ params: candidateIdSchema }),
  completeVideoUpload
);
// --- Direct Video Upload Routes (End) ---

/**
 * @route   GET /api/candidates
 * @desc    Get all candidates with filters
 * @access  Private (All authenticated users)
 */
router.get('/', validate({ query: candidateFiltersSchema }), getCandidates);

/**
 * @route   GET /api/candidates/stats/summary
 * @desc    Get candidates statistics summary (total, by status)
 * @access  Private (All authenticated users)
 */
router.get('/stats/summary', getCandidatesStats);

/**
 * @route   GET /api/candidates/stats/by-city
 * @desc    Get candidates statistics by city
 * @access  Private (All authenticated users)
 */
router.get('/stats/by-city', getCandidatesByCity);

/**
 * @route   GET /api/candidates/suggestions/cities
 * @desc    Get cities suggestions for autocomplete
 * @access  Private (All authenticated users)
 */
router.get('/suggestions/cities', getCitiesSuggestions);

/**
 * @route   GET /api/candidates/suggestions/names
 * @desc    Get candidate names suggestions for autocomplete
 * @access  Private (All authenticated users)
 */
router.get('/suggestions/names', getCandidatesSuggestions);

/**
 * @route   GET /api/candidates/export/csv
 * @desc    Export candidates as CSV (supports same filters as GET /api/candidates)
 * @access  Private (All authenticated users)
 */
router.get('/export/csv', validate({ query: candidateQueryFilters }), exportCandidatesCSV);

/**
 * @route   POST /api/candidates/advanced-search
 * @desc    Advanced search with multiple filters (Phase 1)
 * @access  Private (All authenticated users)
 */
router.post('/advanced-search', validate({ body: advancedSearchSchema }), advancedSearch);

/**
 * @route   POST /api/candidates/ai-search
 * @desc    Parse natural language search query
 * @access  Private (All authenticated users)
 */
router.post('/ai-search', parseNaturalLanguageSearch);

/**
 * @route   POST /api/candidates
 * @desc    Create new candidate
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.post(
  '/',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
  validate({ body: createCandidateSchema }),
  createCandidate
);

// CV routes - MUST be before /:id routes to avoid conflicts
/**
 * @route   POST /api/candidates/:id/cv
 * @desc    Upload CV for candidate
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.post(
  '/:id/cv',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
  validate({ params: candidateIdSchema }),
  uploadCV,
  uploadCandidateCV
);

/**
 * @route   GET /api/candidates/:id/cv/download
 * @desc    Download CV for candidate
 * @access  Private (All authenticated users)
 */
router.get('/:id/cv/download', validate({ params: candidateIdSchema }), downloadCandidateCV);

/**
 * @route   DELETE /api/candidates/:id/cv
 * @desc    Delete CV for candidate
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.delete(
  '/:id/cv',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
  validate({ params: candidateIdSchema }),
  deleteCandidateCV
);

// Video routes - MUST be before /:id routes to avoid conflicts
/**
 * @route   POST /api/candidates/:id/video
 * @desc    Upload video for candidate
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.post(
  '/:id/video',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
  validate({ params: candidateIdSchema }),
  videoUpload.single('video'),
  uploadCandidateVideo
);

/**
 * @route   GET /api/candidates/:id/video
 * @desc    Get video URL for candidate
 * @access  Private (All authenticated users)
 */
router.get('/:id/video', validate({ params: candidateIdSchema }), getCandidateVideoUrl);

/**
 * @route   DELETE /api/candidates/:id/video
 * @desc    Delete video for candidate
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.delete(
  '/:id/video',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
  validate({ params: candidateIdSchema }),
  deleteCandidateVideo
);

// Generic ID routes - MUST be after specific routes
/**
 * @route   GET /api/candidates/:id
 * @desc    Get single candidate by ID
 * @access  Private (All authenticated users)
 */
router.get('/:id', validate({ params: candidateIdSchema }), getCandidateById);

/**
 * @route   GET /api/candidates/:id/similar
 * @desc    Get similar candidates
 * @access  Private (All authenticated users)
 */
router.get('/:id/similar', validate({ params: candidateIdSchema }), getSimilarCandidates);

/**
 * @route   PUT /api/candidates/:id
 * @desc    Update candidate
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.put(
  '/:id',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
  validate({ params: candidateIdSchema, body: updateCandidateSchema }),
  updateCandidate
);

/**
 * @route   DELETE /api/candidates/:id
 * @desc    Delete candidate (soft delete)
 * @access  Private (ADMIN)
 */
router.delete(
  '/:id',
  authorizeRoles('ADMIN'),
  validate({ params: candidateIdSchema }),
  deleteCandidate
);

/**
 * @route   PATCH /api/candidates/:id/archive
 * @desc    Archive candidate
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.patch(
  '/:id/archive',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
  validate({ params: candidateIdSchema }),
  archiveCandidate
);

/**
 * @route   PATCH /api/candidates/:id/unarchive
 * @desc    Unarchive (restore) candidate
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.patch(
  '/:id/unarchive',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
  validate({ params: candidateIdSchema }),
  unarchiveCandidate
);

export default router;
