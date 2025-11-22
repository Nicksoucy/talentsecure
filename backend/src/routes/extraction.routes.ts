import { Router } from 'express';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import { extractCandidateSkills, extractProspectSkills } from '../controllers/extraction.controller';
import { UserRole } from '@prisma/client';

const router = Router();

// All routes require authentication and appropriate roles
router.use(authenticateJWT);

// We cast to any to avoid type issues if Prisma Client is not regenerated
router.post('/candidates/:id/extract', authorizeRoles('ADMIN' as any, 'RH_RECRUITER' as any), extractCandidateSkills);
router.post('/prospects/:id/extract', authorizeRoles('ADMIN' as any, 'RH_RECRUITER' as any), extractProspectSkills);

export default router;
