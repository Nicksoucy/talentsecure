import express from 'express';
import { z } from 'zod';
import {
    getClientInteractions,
    createInteraction,
    deleteInteraction
} from '../controllers/interaction.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';

const router = express.Router({ mergeParams: true });

// Validation Schemas
const createInteractionSchema = z.object({
    type: z.string().min(1, 'Type requis'), // e.g., CALL, EMAIL
    direction: z.string().min(1, 'Direction requise'), // INBOUND, OUTBOUND
    subject: z.string().optional(),
    content: z.string().optional()
});

// Routes
router.use(authenticateJWT);

/**
 * @route   GET /api/clients/:clientId/interactions
 * @desc    Get all interactions for a client
 */
router.get(
    '/',
    validate({ params: z.object({ clientId: z.string().uuid() }) }),
    getClientInteractions
);

/**
 * @route   POST /api/clients/:clientId/interactions
 * @desc    Log a new interaction
 */
router.post(
    '/',
    authorizeRoles('ADMIN', 'SALES', 'RH_RECRUITER'),
    validate({
        params: z.object({ clientId: z.string().uuid() }),
        body: createInteractionSchema
    }),
    createInteraction
);

/**
 * @route   DELETE /api/clients/:clientId/interactions/:id
 * @desc    Delete an interaction
 */
router.delete(
    '/:id',
    authorizeRoles('ADMIN', 'SALES'),
    validate({ params: z.object({ clientId: z.string().uuid(), id: z.string().uuid() }) }),
    deleteInteraction
);

export default router;
