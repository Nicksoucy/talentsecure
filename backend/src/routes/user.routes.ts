import { Router } from 'express';
import { z } from 'zod';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';
import { listUsers, createUser, updateUser, resetPassword } from '../controllers/user.controller';
import { createUserSchema, updateUserSchema, resetPasswordSchema } from '../validation/user.validation';

const router = Router();

// Gestion des comptes : réservée aux ADMIN.
const adminGuard = [authenticateJWT, authorizeRoles('ADMIN')];
const idParam = z.object({ id: z.string().uuid('ID invalide') });

router.get('/', adminGuard, listUsers);
router.post('/', adminGuard, validate({ body: createUserSchema }), createUser);
router.patch('/:id', adminGuard, validate({ params: idParam, body: updateUserSchema }), updateUser);
router.post('/:id/reset-password', adminGuard, validate({ params: idParam, body: resetPasswordSchema }), resetPassword);

export default router;
