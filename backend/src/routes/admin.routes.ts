import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  revertAutoConvertedCandidates,
  findAutoConvertedCandidates,
  revertSingleCandidateToProspect,
} from '../controllers/admin.controller';

const router = Router();

// ADMIN ONLY: Toutes ces routes nécessitent une authentification admin

/**
 * GET /api/admin/auto-converted-candidates
 * Liste tous les candidats auto-convertis (sans les modifier)
 */
router.get('/auto-converted-candidates', authenticate, findAutoConvertedCandidates);

/**
 * POST /api/admin/revert-auto-converted-candidates
 * Re-convertit tous les candidats auto-convertis en prospects
 */
router.post('/revert-auto-converted-candidates', authenticate, revertAutoConvertedCandidates);

/**
 * POST /api/admin/revert-candidate-to-prospect/:id
 * Re-convertit UN SEUL candidat en prospect (utilisé depuis le menu "3 points")
 */
router.post('/revert-candidate-to-prospect/:id', authenticate, revertSingleCandidateToProspect);

export default router;
