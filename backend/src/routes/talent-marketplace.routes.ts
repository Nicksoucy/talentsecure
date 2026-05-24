import express from 'express';
import {
    searchTalentsByCity,
    getAvailableCities,
    getTalentDetail,
    getTalentVideoUrl,
    getClientPurchases,
} from '../controllers/talent-marketplace.controller';
import { createCandidateCheckout } from '../controllers/marketplace-checkout.controller';
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

/**
 * @route   GET /api/marketplace/purchases
 * @desc    Candidats achetés par le client (avec coordonnées)
 */
router.get('/purchases', getClientPurchases);

/**
 * @route   GET /api/marketplace/talents/:id
 * @desc    Détail d'un candidat (coordonnées seulement si acheté)
 */
router.get('/talents/:id', getTalentDetail);

/**
 * @route   GET /api/marketplace/talents/:id/video
 * @desc    URL signée de la vidéo de présentation (avant achat)
 */
router.get('/talents/:id/video', getTalentVideoUrl);

/**
 * @route   POST /api/marketplace/talents/:id/checkout
 * @desc    Crée une session Stripe Checkout pour acheter ce candidat
 */
router.post('/talents/:id/checkout', createCandidateCheckout);

export default router;
