import express from 'express';
import { z } from 'zod';
import {
    getClientContacts,
    createContact,
    updateContact,
    deleteContact
} from '../controllers/contact.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';

const router = express.Router({ mergeParams: true }); // Enable access to :clientId from parent router

// Validation Schemas
const uuidParam = z.object({
    clientId: z.string().uuid('ID Client invalide'),
    id: z.string().uuid('ID Contact invalide').optional()
});

const createContactSchema = z.object({
    firstName: z.string().min(1, 'Prénom requis'),
    lastName: z.string().min(1, 'Nom requis'),
    role: z.string().optional(),
    email: z.string().email('Email invalide').optional().or(z.literal('')),
    phone: z.string().optional(),
    isPrimary: z.boolean().optional(),
    notes: z.string().optional()
});

const updateContactSchema = createContactSchema.partial();

// Routes
router.use(authenticateJWT);

/**
 * @route   GET /api/clients/:clientId/contacts
 * @desc    Get all contacts for a client
 */
router.get(
    '/',
    validate({ params: z.object({ clientId: z.string().uuid() }) }),
    getClientContacts
);

/**
 * @route   POST /api/clients/:clientId/contacts
 * @desc    Create a new contact
 */
router.post(
    '/',
    authorizeRoles('ADMIN', 'SALES', 'RH_RECRUITER'),
    validate({
        params: z.object({ clientId: z.string().uuid() }),
        body: createContactSchema
    }),
    createContact
);

/**
 * @route   PUT /api/clients/:clientId/contacts/:id
 * @desc    Update a contact
 */
router.put(
    '/:id',
    authorizeRoles('ADMIN', 'SALES', 'RH_RECRUITER'),
    validate({
        params: uuidParam,
        body: updateContactSchema
    }),
    updateContact
);

/**
 * @route   DELETE /api/clients/:clientId/contacts/:id
 * @desc    Delete (soft) a contact
 */
router.delete(
    '/:id',
    authorizeRoles('ADMIN', 'SALES'),
    validate({ params: uuidParam }),
    deleteContact
);

export default router;
