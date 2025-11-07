import { Router } from 'express';
import {
  getCatalogues,
  getCatalogueById,
  createCatalogue,
  updateCatalogue,
  deleteCatalogue,
  generateCataloguePDF,
} from '../controllers/catalogue.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';

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
router.get('/:id', getCatalogueById);

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
  updateCatalogue
);

/**
 * @route   DELETE /api/catalogues/:id
 * @desc    Delete catalogue
 * @access  Private (ADMIN)
 */
router.delete('/:id', authorizeRoles('ADMIN'), deleteCatalogue);

/**
 * @route   POST /api/catalogues/:id/generate
 * @desc    Generate PDF for catalogue
 * @access  Private (ADMIN, SALES, RH_RECRUITER)
 */
router.post(
  '/:id/generate',
  authorizeRoles('ADMIN', 'SALES', 'RH_RECRUITER'),
  generateCataloguePDF
);

export default router;
