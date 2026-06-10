import express from 'express';
import { z } from 'zod';
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  reactivateClient,
  registerClient,
} from '../controllers/client.controller';
import { authenticateStaff, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';
import { loginLimiter } from '../middleware/rate-limit.middleware';

// Validation schemas
const uuidParam = z.object({
  id: z.string().uuid('ID invalide'),
});

const router = express.Router();

/**
 * @route   POST /api/clients/register
 * @desc    Public client registration
 * @access  Public
 */
// S3 — inscription publique rate-limitée (anti-abus / création en masse).
// NB : le compte reste isActive:true (auto-activé). Pour exiger une approbation
// manuelle, passer isActive:false dans registerClient + écran d'approbation admin.
router.post('/register', loginLimiter, registerClient);

// All other routes require authentication
router.use(authenticateStaff);

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

import contactRoutes from './contact.routes';
import interactionRoutes from './interaction.routes';

router.use('/:clientId/contacts', contactRoutes);
router.use('/:clientId/interactions', interactionRoutes);

export default router;
