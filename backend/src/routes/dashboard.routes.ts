import { Router } from 'express';
import { getDashboardOverview } from '../controllers/dashboard.controller';
import { authenticateStaff } from '../middleware/auth';

const router = Router();

// All dashboard routes require authentication
router.use(authenticateStaff);

/**
 * @route   GET /api/dashboard/overview
 * @desc    Données agrégées du tableau de bord (catalogues, conversions,
 *          employés, fil d'activité récent) — complète les endpoints
 *          /api/candidates/stats/summary et /api/prospects/stats/summary.
 * @access  Private (All authenticated staff)
 */
router.get('/overview', getDashboardOverview);

export default router;
