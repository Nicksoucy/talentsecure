import express from 'express';
import { z } from 'zod';
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  reactivateClient,
} from '../controllers/client.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';

// Validation schemas
const uuidParam = z.object({
  id: z.string().uuid('ID invalide'),
});

const router = express.Router();

// All routes require authentication
router.use(authenticateJWT);

/**
 * @route   GET /api/clients
 * @desc    Get all clients with filters
 * @access  Authenticated users
 */
router.get('/', getClients);

/**
 * @route   GET /api/clients/:id
 * @desc    Get single client by ID
 * @access  Authenticated users
 */
router.get('/:id', validate({ params: uuidParam }), getClientById);

/**
 * @route   POST /api/clients
 * @desc    Create new client
 * @access  ADMIN, SALES, RH_RECRUITER
 */
router.post(
  '/',
  authorizeRoles('ADMIN', 'SALES', 'RH_RECRUITER'),
  createClient
);

/**
 * @route   PUT /api/clients/:id
 * @desc    Update client
 * @access  ADMIN, SALES, RH_RECRUITER
 */
router.put(
  '/:id',
  authorizeRoles('ADMIN', 'SALES', 'RH_RECRUITER'),
  validate({ params: uuidParam }),
  updateClient
);

/**
 * @route   DELETE /api/clients/:id
 * @desc    Deactivate client
 * @access  ADMIN, SALES
 */
router.delete(
  '/:id',
  authorizeRoles('ADMIN', 'SALES'),
  validate({ params: uuidParam }),
  deleteClient
);

/**
 * @route   POST /api/clients/:id/reactivate
 * @desc    Reactivate client
 * @access  ADMIN, SALES
 */
router.post(
  '/:id/reactivate',
  authorizeRoles('ADMIN', 'SALES'),
  validate({ params: uuidParam }),
  reactivateClient
);

export default router;
