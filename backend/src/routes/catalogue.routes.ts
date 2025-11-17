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
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';

// Validation schemas
const uuidParam = z.object({
  id: z.string().uuid('ID invalide'),
});

const router = Router();

// All catalogue routes require authentication
router.use(authenticateJWT);

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

/**
 * @route   GET /api/catalogues/view/:token
 * @desc    View catalogue by share token (PUBLIC)
 * @access  Public
 */
router.get('/view/:token', getCatalogueByToken);

export default router;
