import { Router } from 'express';
import { resolveLocation } from '../controllers/geo.controller';
import { authenticateStaff } from '../middleware/auth';

const router = Router();

// Authentification requise (comme les autres routes /api).
router.use(authenticateStaff);

/**
 * @route   GET /api/geo/resolve
 * @desc    Résout un code postal ou une ville (Québec) en { lat, lng, source }.
 *          Query : ?q=H2X 1Y4 | ?postalCode=H2X1Y4 | ?city=Laval
 * @access  Private (All authenticated users)
 */
router.get('/resolve', resolveLocation);

export default router;
