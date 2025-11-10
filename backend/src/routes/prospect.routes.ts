import { Router } from 'express';
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
} from '../controllers/prospect.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';

const router = Router();

// All prospect routes require authentication
router.use(authenticateJWT);

/**
 * @route   GET /api/prospects
 * @desc    Get all prospect candidates with filters
 * @access  Private (All authenticated users)
 */
router.get('/', getProspects);

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
  convertToCandidate
);

/**
 * @route   GET /api/prospects/:id
 * @desc    Get single prospect by ID
 * @access  Private (All authenticated users)
 */
router.get('/:id', getProspectById);

/**
 * @route   PUT /api/prospects/:id
 * @desc    Update prospect candidate
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.put(
  '/:id',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
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
  deleteProspect
);

export default router;
