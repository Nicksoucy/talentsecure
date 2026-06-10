import { Router } from 'express';
import { z } from 'zod';
import {
  getCatalogues,
  getCatalogueById,
  createCatalogue,
  updateCatalogue,
  deleteCatalogue,
  generateCataloguePDF,
  generateShareLink,
  getCatalogueByToken,
} from '../controllers/catalogue.controller';
import { authenticateStaff, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';
import { publicShareLimiter } from '../middleware/rate-limit.middleware';

// Validation schemas
const uuidParam = z.object({
  id: z.string().uuid('ID invalide'),
});

const router = Router();

/**
 * @route   GET /api/catalogues/view/:token
 * @desc    View catalogue by share token (PUBLIC, no auth)
 * @access  Public — gated only by token unguessability + expiration + rate limit.
 *          Must be declared BEFORE router.use(authenticateStaff) below, otherwise
 *          the auth middleware rejects unauthenticated viewers.
 */
router.get('/view/:token', publicShareLimiter, getCatalogueByToken);

// All other catalogue routes require authentication
router.use(authenticateStaff);

/**
 * @route   GET /api/catalogues
 * @desc    Get all catalogues with filters
 * @access  Private (All authenticated users)
 */
router.get('/', getCatalogues);

/**
 * @route   GET /api/catalogues/:id
 * @desc    Get single catalogue by ID
 * @access  Private (All authenticated users)
 */
router.get('/:id', validate({ params: uuidParam }), getCatalogueById);

/**
 * @route   POST /api/catalogues
 * @desc    Create new catalogue
 * @access  Private (ADMIN, SALES)
 */
router.post(
  '/',
  authorizeRoles('ADMIN', 'SALES', 'RH_RECRUITER'),
  createCatalogue
);

/**
 * @route   PUT /api/catalogues/:id
 * @desc    Update catalogue
 * @access  Private (ADMIN, SALES)
 */
router.put(
  '/:id',
  authorizeRoles('ADMIN', 'SALES', 'RH_RECRUITER'),
  validate({ params: uuidParam }),
  updateCatalogue
);

/**
 * @route   DELETE /api/catalogues/:id
 * @desc    Delete catalogue
 * @access  Private (ADMIN)
 */
router.delete('/:id', authorizeRoles('ADMIN'), validate({ params: uuidParam }), deleteCatalogue);

/**
 * @route   POST /api/catalogues/:id/generate
 * @desc    Generate PDF for catalogue
 * @access  Private (ADMIN, SALES, RH_RECRUITER)
 */
router.post(
  '/:id/generate',
  authorizeRoles('ADMIN', 'SALES', 'RH_RECRUITER'),
  validate({ params: uuidParam }),
  generateCataloguePDF
);

/**
 * @route   POST /api/catalogues/:id/share
 * @desc    Generate shareable link for catalogue
 * @access  Private (ADMIN, SALES, RH_RECRUITER)
 */
router.post(
  '/:id/share',
  authorizeRoles('ADMIN', 'SALES', 'RH_RECRUITER'),
  validate({ params: uuidParam }),
  generateShareLink
);

export default router;
