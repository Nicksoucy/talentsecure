import { Request, Response } from 'express';
import crypto from 'crypto';
import { ingestGhlProspect, readGhlWebhookBody } from '../services/ghl-prospect-intake.service';

/**
 * Vérifie le secret du webhook GHL — fail-closed + timing-safe.
 * Si GOHIGHLEVEL_WEBHOOK_SECRET n'est pas configuré, on REFUSE (jamais fail-open).
 */
function verifyGhlWebhookSecret(headerValue: unknown): boolean {
  const expected = process.env.GOHIGHLEVEL_WEBHOOK_SECRET;
  if (!expected) return false;
  if (typeof headerValue !== 'string' || headerValue.length === 0) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Webhook handler pour les soumissions GoHighLevel
 */
export const handleGoHighLevelWebhook = async (req: Request, res: Response) => {
  try {
    // S7 — ne pas logger le body complet (contient nom/email/tél/adresse = PII).
    // On logge seulement la structure (clés présentes) pour le debug.
    console.log('📥 Webhook GoHighLevel reçu', { keys: Object.keys(req.body || {}) });

    // Vérifier la clé secrète (sécurité) — fail-closed si non configuré.
    if (!verifyGhlWebhookSecret(req.headers['x-webhook-secret'])) {
      console.error('❌ Webhook secret invalide ou non configuré');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { status, body } = await ingestGhlProspect(readGhlWebhookBody(req.body));
    return res.status(status).json(body);

  } catch (error) {
    console.error('❌ Erreur lors du traitement du webhook:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Webhook pour le survey vidéo GHL.
 * Le payload GHL ne contient pas les fichiers de façon fiable → on retrouve
 * la soumission via l'API GHL (par email/téléphone du contact) puis on la
 * synchronise (télécharge CV + vidéo dans R2, capte les réponses, upsert).
 */
export const handleSurveyWebhook = async (req: Request, res: Response) => {
  try {
    // Fail-closed si le secret n'est pas configuré (jamais fail-open).
    if (!verifyGhlWebhookSecret(req.headers['x-webhook-secret'])) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = req.body || {};
    const contact = body.contact || {};
    const email = (body.email || body.form_data?.email || contact.email || '').trim() || null;
    const phone = (body.phone || body.form_data?.phone || contact.phone || '').trim() || null;

    if (!email && !phone) {
      return res.status(400).json({ error: 'email ou téléphone requis' });
    }

    const { findSubmissionByContact, syncOneSubmission } = require('../services/survey-sync.service');
    const submission = await findSubmissionByContact(email, phone);
    if (!submission) {
      // La soumission n'est peut-être pas encore disponible côté API.
      return res.status(202).json({
        message: 'Soumission introuvable pour le moment (sera rattrapée par la synchro planifiée).',
        email, phone,
      });
    }

    const result = await syncOneSubmission(submission);
    return res.status(200).json({ message: 'Survey synchronisé', result });
  } catch (error) {
    console.error('❌ Erreur webhook survey:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Test endpoint pour vérifier que le webhook fonctionne
 */
export const testWebhook = async (req: Request, res: Response) => {
  return res.status(200).json({
    message: 'Webhook endpoint is working',
    timestamp: new Date().toISOString(),
  });
};
