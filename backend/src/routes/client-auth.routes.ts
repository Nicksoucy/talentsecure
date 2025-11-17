import { Router } from 'express';
import { z } from 'zod';
import {
  clientLogin,
  clientRefreshToken,
  getClientProfile,
  getClientCatalogues,
  getClientCatalogueById,
  getCatalogueStatsByCity,
  getAllCandidatesStatsByCity,
} from '../controllers/client-auth.controller';
import { authenticateJWT } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requis'),
});

const uuidParam = z.object({
  id: z.string().uuid('ID invalide'),
});

const router = Router();

/**
 * @route   POST /api/client-auth/login
 * @desc    Client login with email/password
 * @access  Public
 */
router.post(
  '/login',
  validate({ body: loginSchema }),
  clientLogin
);

/**
 * @route   POST /api/client-auth/refresh
 * @desc    Refresh client access token
 * @access  Public
 */
router.post(
  '/refresh',
  validate({ body: refreshTokenSchema }),
  clientRefreshToken
);

/**
 * @route   GET /api/client-auth/profile
 * @desc    Get current client profile
 * @access  Private (Client only)
 */
router.get(
  '/profile',
  authenticateJWT,
  getClientProfile
);

/**
 * @route   GET /api/client-auth/catalogues
 * @desc    Get all catalogues for current client
 * @access  Private (Client only)
 */
router.get(
  '/catalogues',
  authenticateJWT,
  getClientCatalogues
);

/**
 * @route   GET /api/client-auth/catalogues/:id
 * @desc    Get single catalogue by ID for current client
 * @access  Private (Client only)
 */
router.get(
  '/catalogues/:id',
  authenticateJWT,
  validate({ params: uuidParam }),
  getClientCatalogueById
);

/**
 * @route   GET /api/client-auth/catalogues/:id/stats/by-city
 * @desc    Get catalogue statistics by city for maps
 * @access  Private (Client only)
 */
router.get(
  '/catalogues/:id/stats/by-city',
  authenticateJWT,
  validate({ params: uuidParam }),
  getCatalogueStatsByCity
);

/**
 * @route   GET /api/client-auth/prospects/stats/by-city
 * @desc    Get all available candidates statistics by city (talent pool)
 * @access  Private (Client only)
 */
router.get(
  '/prospects/stats/by-city',
  authenticateJWT,
  getAllCandidatesStatsByCity
);

export default router;
