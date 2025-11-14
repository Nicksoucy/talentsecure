import { Router } from 'express';
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
  uploadCandidateVideo,
  getCandidateVideoUrl,
  deleteCandidateVideo,
  getCandidatesStats,
} from '../controllers/candidate.controller';
import {
  uploadCandidateCV,
  downloadCandidateCV,
  deleteCandidateCV,
} from '../controllers/upload.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import { uploadCV } from '../middleware/upload';
import { videoUpload } from '../services/video.service';

const router = Router();

// All candidate routes require authentication
router.use(authenticateJWT);

/**
 * @route   GET /api/candidates
 * @desc    Get all candidates with filters
 * @access  Private (All authenticated users)
 */
router.get('/', getCandidates);

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
 * @route   POST /api/candidates
 * @desc    Create new candidate
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.post(
  '/',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
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
  uploadCV,
  uploadCandidateCV
);

/**
 * @route   GET /api/candidates/:id/cv/download
 * @desc    Download CV for candidate
 * @access  Private (All authenticated users)
 */
router.get('/:id/cv/download', downloadCandidateCV);

/**
 * @route   DELETE /api/candidates/:id/cv
 * @desc    Delete CV for candidate
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.delete(
  '/:id/cv',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
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
  videoUpload.single('video'),
  uploadCandidateVideo
);

/**
 * @route   GET /api/candidates/:id/video
 * @desc    Get video URL for candidate
 * @access  Private (All authenticated users)
 */
router.get('/:id/video', getCandidateVideoUrl);

/**
 * @route   DELETE /api/candidates/:id/video
 * @desc    Delete video for candidate
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.delete(
  '/:id/video',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
  deleteCandidateVideo
);

// Generic ID routes - MUST be after specific routes
/**
 * @route   GET /api/candidates/:id
 * @desc    Get single candidate by ID
 * @access  Private (All authenticated users)
 */
router.get('/:id', getCandidateById);

/**
 * @route   PUT /api/candidates/:id
 * @desc    Update candidate
 * @access  Private (ADMIN, RH_RECRUITER)
 */
router.put(
  '/:id',
  authorizeRoles('ADMIN', 'RH_RECRUITER'),
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
  unarchiveCandidate
);

export default router;
