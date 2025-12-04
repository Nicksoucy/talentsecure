import { Router } from 'express';
import { z } from 'zod';
import {
  getProspects,
  getProspectById,
  createProspect,
  updateProspect,
  deleteProspect,
  markAsContacted,
  convertToCandidate,
  getProspectsByCity,
  getCitiesSuggestions,
  getProspectsSuggestions,
  getProspectsStats,
  getProspectsExtractionStats,
  getProspectExtractionHistory,
} from '../controllers/prospect.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';

// Validation schemas
const uuidParam = z.object({
  id: z.string().uuid('ID invalide'),
});

const prospectQueryFilters = z.object({
  search: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  isContacted: z.string().optional(),
  isConverted: z.string().optional(),
  includeProcessed: z.string().optional(), // NOUVEAU : filtrage dynamique
  submissionDateStart: z.string().optional(),
  submissionDateEnd: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
}).strict();

const router = Router();

// All prospect routes require authentication
router.use(authenticateJWT);

/**
 * @route   GET /api/prospects
 * @desc    Get all prospect candidates with filters
 * @access  Private (All authenticated users)
 */
router.get('/', validate({ query: prospectQueryFilters }), getProspects);

/**
 * @route   GET /api/prospects/stats/summary
 * @desc    Get overall prospect statistics
 * @access  Private (All authenticated users)
 */
router.get('/stats/summary', getProspectsStats);

/**
 * @route   GET /api/prospects/stats/by-city
 * @desc    Get prospects statistics by city
 * @access  Private (All authenticated users)
 */
router.get('/stats/by-city', getProspectsByCity);

/**
 * @route   GET /api/prospects/stats/extraction
 * @desc    Get extraction statistics (processed vs unprocessed prospects)
 * @access  Private (All authenticated users)
 */
router.get('/stats/extraction', getProspectsExtractionStats);

/**
 * @route   GET /api/prospects/suggestions/cities
 * @desc    Get cities suggestions for autocomplete
 * @access  Private (All authenticated users)
 */
router.get('/suggestions/cities', getCitiesSuggestions);

/**
 * @route   GET /api/prospects/suggestions/names
 * @desc    Get prospect names suggestions for autocomplete
 * @access  Private (All authenticated users)
 */
router.get('/suggestions/names', getProspectsSuggestions);

/**
 * @route   POST /api/prospects
 * @desc    Create new prospect candidate
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.post(
  '/',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
  createProspect
);

/**
 * @route   POST /api/prospects/:id/contact
 * @desc    Mark prospect as contacted
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.post(
  '/:id/contact',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
  validate({ params: uuidParam }),
  markAsContacted
);

/**
 * @route   POST /api/prospects/:id/convert
 * @desc    Convert prospect to qualified candidate
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.post(
  '/:id/convert',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
  validate({ params: uuidParam }),
  convertToCandidate
);

/**
 * @route   GET /api/prospects/:id/extraction-history
 * @desc    Get extraction history for a specific prospect
 * @access  Private (All authenticated users)
 */
router.get('/:id/extraction-history', validate({ params: uuidParam }), getProspectExtractionHistory);

/**
 * @route   GET /api/prospects/:id
 * @desc    Get single prospect by ID
 * @access  Private (All authenticated users)
 */
router.get('/:id', validate({ params: uuidParam }), getProspectById);

/**
 * @route   PUT /api/prospects/:id
 * @desc    Update prospect candidate
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.put(
  '/:id',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
  validate({ params: uuidParam }),
  updateProspect
);

/**
 * @route   DELETE /api/prospects/:id
 * @desc    Delete prospect (soft delete)
 * @access  Private (ADMIN)
 */
router.delete(
  '/:id',
  authorizeRoles('ADMIN'),
  validate({ params: uuidParam }),
  deleteProspect
);

export default router;
