import express from 'express';
import { handleGoHighLevelWebhook, testWebhook } from '../controllers/webhook.controller';

const router = express.Router();

/**
 * POST /api/webhooks/gohighlevel/prospect
 * Reçoit les soumissions du formulaire GoHighLevel
 */
router.post('/gohighlevel/prospect', handleGoHighLevelWebhook);

/**
 * GET /api/webhooks/test
 * Endpoint de test pour vérifier que le webhook fonctionne
 */
router.get('/test', testWebhook);

export default router;
