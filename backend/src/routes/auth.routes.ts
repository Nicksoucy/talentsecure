import { Router } from 'express';
import passport from 'passport';
import {
  register,
  login,
  refreshToken,
  getProfile,
  logout,
  googleCallback,
  seedAdmin,
} from '../controllers/auth.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import { validateRequest } from '../middleware/validation.middleware';
import { registerSchema, loginSchema } from '../validation/auth.validation';

const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register new user
 * @access  Admin only (Production-ready security)
 */
router.post(
  '/register',
  authenticateJWT,
  authorizeRoles('ADMIN'),
  validateRequest(registerSchema),
  register
);

/**
 * @route   POST /api/auth/login
 * @desc    Login with email/password
 * @access  Public
 */
router.post('/login', validateRequest(loginSchema), login);

/**
 * @route   POST /api/auth/seed-admin
 * @desc    Seed admin user (Protected by secret)
 * @access  Public (Emergency)
 */
router.post('/seed-admin', seedAdmin);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh', refreshToken);

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile', authenticateJWT, getProfile);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', authenticateJWT, logout);

/**
 * @route   GET /api/auth/google
 * @desc    Initiate Google OAuth
 * @access  Public
 * @note    Disabled until Google credentials are configured
 */
// router.get(
//   '/google',
//   passport.authenticate('google', {
//     scope: ['profile', 'email'],
//     session: false,
//   })
// );

/**
 * @route   GET /api/auth/google/callback
 * @desc    Google OAuth callback
 * @access  Public
 * @note    Disabled until Google credentials are configured
 */
// router.get('/google/callback', googleCallback);

// Microsoft OAuth routes would be similar
/**
 * @route   GET /api/auth/microsoft
 * @desc    Initiate Microsoft OAuth
 * @access  Public
 */
// router.get('/microsoft', passport.authenticate('microsoft', { scope: ['user.read'], session: false }));

/**
 * @route   GET /api/auth/microsoft/callback
 * @desc    Microsoft OAuth callback
 * @access  Public
 */
// router.get('/microsoft/callback', microsoftCallback);

export default router;
