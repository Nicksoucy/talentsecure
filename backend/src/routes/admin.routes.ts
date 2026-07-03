import { Router } from 'express';
import { z } from 'zod';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';
import {
  revertAutoConvertedCandidates,
  findAutoConvertedCandidates,
  revertSingleCandidateToProspect,
  revertBatchCandidatesToProspects,
} from '../controllers/admin.controller';

const router = Router();

const revertBatchSchema = z.object({ ids: z.array(z.string()).min(1, 'liste d\'ids invalide') }).passthrough();

// ADMIN ONLY: every route below is gated by JWT auth + ADMIN role check.
// Without the role check, any authenticated user (RH_RECRUITER, SALES, CLIENT)
// could revert candidates back to prospects.
const adminGuard = [authenticateJWT, authorizeRoles('ADMIN')];

/**
 * GET /api/admin/auto-converted-candidates
 * Liste tous les candidats auto-convertis (sans les modifier)
 */
router.get('/auto-converted-candidates', adminGuard, findAutoConvertedCandidates);

/**
 * POST /api/admin/revert-auto-converted-candidates
 * Re-convertit tous les candidats auto-convertis en prospects
 */
router.post('/revert-auto-converted-candidates', adminGuard, revertAutoConvertedCandidates);

/**
 * POST /api/admin/revert-candidate-to-prospect/:id
 * Re-convertit UN SEUL candidat en prospect (utilisé depuis le menu "3 points")
 */
router.post('/revert-candidate-to-prospect/:id', adminGuard, revertSingleCandidateToProspect);

/**
 * POST /api/admin/revert-batch-candidates-to-prospects
 * Re-convertit PLUSIEURS candidats en prospects (Batch)
 */
router.post('/revert-batch-candidates-to-prospects', adminGuard, validate({ body: revertBatchSchema }), revertBatchCandidatesToProspects);

export default router;
