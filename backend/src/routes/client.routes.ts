import express from 'express';
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  reactivateClient,
} from '../controllers/client.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';

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
router.get('/:id', getClientById);

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
  reactivateClient
);

export default router;
