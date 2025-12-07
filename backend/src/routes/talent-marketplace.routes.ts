import express from 'express';
import {
    searchTalentsByCity,
    getAvailableCities,
} from '../controllers/talent-marketplace.controller';
import { authenticateClient } from '../middleware/client-auth.middleware';

const router = express.Router();

// All marketplace routes require client authentication
router.use(authenticateClient);

/**
 * @route   GET /api/marketplace/talents
 * @desc    Search talents by city with filters
 * @access  Authenticated clients
 */
router.get('/talents', searchTalentsByCity);

/**
 * @route   GET /api/marketplace/cities
 * @desc    Get list of cities with available candidates
 * @access  Authenticated clients
 */
router.get('/cities', getAvailableCities);

export default router;
