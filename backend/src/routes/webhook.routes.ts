import express from 'express';
import { handleGoHighLevelWebhook, handleSurveyWebhook, testWebhook } from '../controllers/webhook.controller';

const router = express.Router();

/**
 * POST /api/webhooks/gohighlevel/prospect
 * Reçoit les soumissions du formulaire GoHighLevel
 */
router.post('/gohighlevel/prospect', handleGoHighLevelWebhook);

/**
 * POST /api/webhooks/gohighlevel/survey-prospect
 * Reçoit la notification de soumission du survey vidéo, puis tire la
 * soumission (CV + vidéo + réponses) via l'API GHL.
 */
router.post('/gohighlevel/survey-prospect', handleSurveyWebhook);

/**
 * GET /api/webhooks/test
 * Endpoint de test pour vérifier que le webhook fonctionne
 */
router.get('/test', testWebhook);

export default router;
