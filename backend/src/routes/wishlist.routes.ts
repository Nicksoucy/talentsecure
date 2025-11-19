import { Router } from 'express';
import { z } from 'zod';
import {
  getCityPricing,
  getCurrentWishlist,
  addWishlistItem,
  updateWishlistItem,
  removeWishlistItem,
  clearWishlist,
  submitWishlist,
  getAvailableCandidatesCount,
  // Admin endpoints
  getAllWishlists,
  getWishlistById,
  updateWishlistStatus,
  deleteWishlist,
} from '../controllers/wishlist.controller';
import { authenticateJWT } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';

// Validation schemas
const addItemSchema = z.object({
  city: z.string().min(1, 'Ville requise'),
  province: z.string().optional().default('QC'),
  type: z.enum(['EVALUATED', 'CV_ONLY'], {
    errorMap: () => ({ message: 'Type invalide' }),
  }),
  quantity: z.number().int().min(1, 'Quantité doit être >= 1'),
  notes: z.string().optional(),
});

const updateItemSchema = z.object({
  quantity: z.number().int().min(1, 'Quantité doit être >= 1'),
});

const updateStatusSchema = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'DELIVERED', 'CANCELLED']),
  adminNotes: z.string().optional(),
});

const router = Router();

/**
 * @route   GET /api/wishlist/pricing/:city
 * @desc    Get pricing for a specific city
 * @access  Private (Client only)
 */
router.get(
  '/pricing/:city',
  authenticateJWT,
  getCityPricing
);

/**
 * @route   GET /api/wishlist
 * @desc    Get current client's active wishlist
 * @access  Private (Client only)
 */
router.get(
  '/',
  authenticateJWT,
  getCurrentWishlist
);

/**
 * @route   POST /api/wishlist/items
 * @desc    Add item to wishlist
 * @access  Private (Client only)
 */
router.post(
  '/items',
  authenticateJWT,
  validate({ body: addItemSchema }),
  addWishlistItem
);

/**
 * @route   PUT /api/wishlist/items/:id
 * @desc    Update wishlist item quantity
 * @access  Private (Client only)
 */
router.put(
  '/items/:id',
  authenticateJWT,
  validate({ body: updateItemSchema }),
  updateWishlistItem
);

/**
 * @route   DELETE /api/wishlist/items/:id
 * @desc    Remove item from wishlist
 * @access  Private (Client only)
 */
router.delete(
  '/items/:id',
  authenticateJWT,
  removeWishlistItem
);

/**
 * @route   DELETE /api/wishlist
 * @desc    Clear wishlist (remove all items)
 * @access  Private (Client only)
 */
router.delete(
  '/',
  authenticateJWT,
  clearWishlist
);

/**
 * @route   POST /api/wishlist/submit
 * @desc    Submit wishlist (change status to SUBMITTED)
 * @access  Private (Client only)
 */
router.post(
  '/submit',
  authenticateJWT,
  submitWishlist
);

/**
 * @route   GET /api/wishlist/available/:city
 * @desc    Get available candidates count for a city
 * @access  Private (Client only)
 */
router.get(
  '/available/:city',
  authenticateJWT,
  getAvailableCandidatesCount
);

// =============================================================================
// ADMIN ROUTES
// =============================================================================

/**
 * @route   GET /api/wishlist/admin/all
 * @desc    Get all wishlists (Admin only)
 * @access  Private (Admin only)
 * @query   status, clientId, startDate, endDate
 */
router.get(
  '/admin/all',
  authenticateJWT,
  getAllWishlists
);

/**
 * @route   GET /api/wishlist/admin/:id
 * @desc    Get single wishlist by ID (Admin only)
 * @access  Private (Admin only)
 */
router.get(
  '/admin/:id',
  authenticateJWT,
  getWishlistById
);

/**
 * @route   PUT /api/wishlist/admin/:id/status
 * @desc    Update wishlist status (Admin only)
 * @access  Private (Admin only)
 */
router.put(
  '/admin/:id/status',
  authenticateJWT,
  validate({ body: updateStatusSchema }),
  updateWishlistStatus
);

/**
 * @route   DELETE /api/wishlist/admin/:id
 * @desc    Cancel/Delete wishlist (Admin only)
 * @access  Private (Admin only)
 */
router.delete(
  '/admin/:id',
  authenticateJWT,
  deleteWishlist
);

export default router;
