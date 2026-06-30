import { Router } from 'express';
import { z } from 'zod';
import { authenticateStaff, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';
import { extractCandidateSkills, extractProspectSkills } from '../controllers/extraction.controller';
import { UserRole } from '@prisma/client';

const router = Router();

// Body optionnel : model/method ont des défauts côté controller.
const extractSchema = z.object({ model: z.string().optional(), method: z.string().optional() }).passthrough();

// All routes require authentication and appropriate roles
router.use(authenticateStaff);

// We cast to any to avoid type issues if Prisma Client is not regenerated
router.post('/candidates/:id/extract', authorizeRoles('ADMIN' as any, 'RH_RECRUITER' as any), validate({ body: extractSchema }), extractCandidateSkills);
router.post('/prospects/:id/extract', authorizeRoles('ADMIN' as any, 'RH_RECRUITER' as any), validate({ body: extractSchema }), extractProspectSkills);

export default router;
