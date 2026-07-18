/**
 * Configuration centralisée de l'intégration GoHighLevel (LeadConnector) API v2.
 *
 * Source unique de vérité pour le token, la location, l'URL de base et les
 * en-têtes GHL. Remplace les constantes dupliquées — et les tokens codés en dur —
 * qui traînaient dans sms.service, ghl-email.service, survey-sync.service et
 * prospect.controller.
 *
 * SÉCURITÉ : le PIT (Private Integration Token) est un SECRET. Il doit provenir
 * EXCLUSIVEMENT de l'environnement (Cloud Run / Secret Manager en prod, .env en
 * local) — aucun fallback codé en dur. Si `GHL_PIT_TOKEN` est absent, on refuse
 * de démarrer (fail-fast), comme config/env.ts le fait pour les secrets JWT.
 * L'ancien token `pit-7de455ab-…` a fuité dans l'historique git : il est
 * explicitement banni pour qu'il ne puisse jamais être réintroduit.
 *
 * En test (`NODE_ENV=test`), la validation est désactivée : les appels GHL sont
 * mockés par les suites, le token réel n'est jamais requis.
 */

import dotenv from 'dotenv';

const IS_TEST = process.env.NODE_ENV === 'test';

// Charge le .env pour les scripts/CLI qui importent ce module sans passer par
// config/env.ts (lequel charge déjà dotenv en amont de server.ts — un 2e appel
// est un no-op inoffensif). En test, on ne charge JAMAIS le .env (isolation des
// secrets — même politique que config/env.ts).
if (!IS_TEST) {
  dotenv.config();
}

/** Token révoqué (fuite dans l'historique git) — interdit de le réutiliser. */
const REVOKED_TOKEN = 'pit-7de455ab-c46e-47a4-af9e-0b07a6c3a1ee';

const token = (process.env.GHL_PIT_TOKEN || '').trim();

if (!IS_TEST) {
  if (!token) {
    console.error('\n❌ GHL_PIT_TOKEN manquant — intégration GoHighLevel non configurée.\n');
    throw new Error(
      "Configuration GHL invalide: GHL_PIT_TOKEN est requis (Cloud Run / Secret Manager en prod, .env en local).",
    );
  }
  if (token === REVOKED_TOKEN) {
    console.error('\n❌ GHL_PIT_TOKEN correspond à un token révoqué (fuite git).\n');
    throw new Error(
      'Configuration GHL invalide: ce PIT a fuité et a été révoqué. Générez un nouveau Private Integration Token dans GHL et placez-le dans GHL_PIT_TOKEN.',
    );
  }
}

/** URL de base de l'API GHL v2 (LeadConnector). */
export const GHL_BASE = 'https://services.leadconnectorhq.com';

/** En-tête de version obligatoire de l'API v2. */
export const GHL_VERSION = '2021-07-28';

/** Private Integration Token (Bearer). En test : chaîne vide (appels mockés). */
export const GHL_TOKEN = token;

/** Location GHL (sous-compte « Xguard »). Identifiant non secret. */
export const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || 'dfkLurZY2ADWAUZl4zYc';

/**
 * En-têtes standard pour toute requête GHL v2.
 * Pour un POST JSON, spreadez-les et ajoutez `'Content-Type': 'application/json'`.
 */
export const GHL_HEADERS = {
  Authorization: `Bearer ${GHL_TOKEN}`,
  Version: GHL_VERSION,
};

/** Survey « Recrutement - Candidature + Vidéo 30s ». Identifiant non secret. */
export const GHL_SURVEY_ID = process.env.GHL_SURVEY_ID || '7R37monCgHPJyTiinjn3';
