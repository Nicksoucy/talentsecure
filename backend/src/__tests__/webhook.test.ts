import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';

/**
 * Webhooks GoHighLevel — /api/webhooks/*
 *
 * Endpoints (src/routes/webhook.routes.ts), AUCUN middleware d'auth JWT :
 * la sécurité repose sur l'en-tête `x-webhook-secret` comparé (timing-safe,
 * fail-closed) à `process.env.GOHIGHLEVEL_WEBHOOK_SECRET`.
 *
 *   POST /api/webhooks/gohighlevel/prospect        → handleGoHighLevelWebhook
 *   POST /api/webhooks/gohighlevel/survey-prospect  → handleSurveyWebhook
 *   GET  /api/webhooks/test                         → testWebhook (ping)
 *
 * Couvre :
 *  - garde du secret (fail-closed) : 401 sans en-tête, 401 mauvais secret ;
 *  - validation : 400 si first_name OU phone manquant (prospect) ;
 *  - 404/409 métier : 409 doublon (par téléphone), priorité Employé/Candidat
 *    qui renvoient 200 « non ajouté » et NE créent PAS de prospect ;
 *  - chemins heureux : 201 + persistance réelle en base (form-cv) ;
 *  - survey : 400 sans email/téléphone, 202 quand la soumission est introuvable.
 *
 * Services externes MOCKÉS (zéro réseau réel) :
 *  - ../services/survey-sync.service  (API GHL : findSubmissionByContact / syncOneSubmission)
 *  - ../utils/ghlFetch + ../services/r2.service (téléchargement vidéo + R2),
 *    chargés en `require()` paresseux dans le contrôleur seulement si video_url.
 */

// Le secret DOIT être en place AVANT que le contrôleur ne le lise (à la requête).
const WEBHOOK_SECRET = 'test-webhook-secret-value-123';
process.env.GOHIGHLEVEL_WEBHOOK_SECRET = WEBHOOK_SECRET;

// Mocks des services externes — déclarés avant l'import de createApp.
jest.mock('../services/survey-sync.service', () => ({
  findSubmissionByContact: jest.fn(),
  syncOneSubmission: jest.fn(),
}));
jest.mock('../utils/ghlFetch', () => ({
  downloadGhlFile: jest.fn(),
  detectExtension: jest.fn(() => '.mp4'),
  isLikelyVideo: jest.fn(() => true),
}));
jest.mock('../services/r2.service', () => ({
  uploadBufferToR2: jest.fn(async () => undefined),
}));

import { createApp } from '../app';
const surveySync = require('../services/survey-sync.service');

const PROSPECT_URL = '/api/webhooks/gohighlevel/prospect';
const SURVEY_URL = '/api/webhooks/gohighlevel/survey-prospect';

describe('Webhooks GoHighLevel — /api/webhooks', () => {
  let app: Express;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /test (ping)', () => {
    it('répond 200 même sans secret (endpoint de diagnostic public)', async () => {
      const res = await request(app).get('/api/webhooks/test');
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/working/i);
    });
  });

  describe('garde du secret (fail-closed)', () => {
    it('sans en-tête x-webhook-secret → 401', async () => {
      const res = await request(app)
        .post(PROSPECT_URL)
        .send({ first_name: 'Jean', phone: '5145550001' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('mauvais secret → 401 (jamais fail-open)', async () => {
      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', 'mauvais-secret')
        .send({ first_name: 'Jean', phone: '5145550001' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /gohighlevel/prospect — validation', () => {
    it('phone manquant → 400 + structure sans PII', async () => {
      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({ first_name: 'Sans', email: 'sans-tel@test.com' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing required fields');
      expect(res.body.received).toEqual({ hasFirstName: true, hasPhone: false });
    });

    it('first_name manquant → 400', async () => {
      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({ phone: '5145550099' });
      expect(res.status).toBe(400);
      expect(res.body.received).toEqual({ hasFirstName: false, hasPhone: true });
    });
  });

  describe('POST /gohighlevel/prospect — chemin heureux', () => {
    it('payload valide (sans vidéo) → 201 et prospect persisté', async () => {
      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({
          first_name: 'Heureux',
          last_name: 'Chemin',
          email: 'heureux@test.com',
          phone: '5145551234',
          city: 'montreal',
          state: 'QC',
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.prospectId).toBeDefined();

      const inDb = await prisma.prospectCandidate.findUnique({
        where: { id: res.body.prospectId },
      });
      expect(inDb).not.toBeNull();
      expect(inDb?.firstName).toBe('Heureux');
      expect(inDb?.phone).toBe('5145551234');
      expect(inDb?.source).toBe('form-cv');
      // Pas de video_url → aucun appel R2/téléchargement.
      const r2 = require('../services/r2.service');
      expect(r2.uploadBufferToR2).not.toHaveBeenCalled();
    });
  });

  describe('POST /gohighlevel/prospect — doublon (409)', () => {
    it('même téléphone qu’un prospect existant non supprimé → 409', async () => {
      await prisma.prospectCandidate.create({
        data: {
          firstName: 'Deja',
          lastName: 'La',
          phone: '5145559999',
          email: 'deja@test.com',
          source: 'form-cv',
          isDeleted: false,
        },
      });

      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({ first_name: 'Autre', phone: '5145559999' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Duplicate prospect');
      expect(res.body.matchedBy).toBe('phone');
    });
  });

  describe('POST /gohighlevel/prospect — priorités contact', () => {
    it('déjà Employé → 200 « non ajouté » et aucun prospect créé', async () => {
      const emp = await prisma.employee.create({
        data: {
          firstName: 'Employe',
          lastName: 'Actif',
          phone: '5145558888',
          email: 'employe@test.com',
          city: 'Laval',
          isDeleted: false,
        },
      });

      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({ first_name: 'Employe', phone: '5145558888' });
      expect(res.status).toBe(200);
      expect(res.body.employeeId).toBe(emp.id);
      expect(res.body.message).toMatch(/Employé/i);

      // Aucun prospect ne doit avoir été créé pour ce téléphone.
      const created = await prisma.prospectCandidate.findFirst({
        where: { phone: '5145558888' },
      });
      expect(created).toBeNull();
    });

    it('déjà Candidat (avec fiche prospect en attente) → 200 + prospect marqué converti', async () => {
      // Candidate.createdById est une FK requise vers User.
      const creator = await prisma.user.create({
        data: {
          email: 'creator.webhook@test.com',
          password: 'x'.repeat(20),
          firstName: 'Cre',
          lastName: 'Ator',
          role: 'ADMIN',
          isActive: true,
        },
      });
      const cand = await prisma.candidate.create({
        data: {
          firstName: 'Candidat',
          lastName: 'Confirme',
          phone: '5145557777',
          email: 'candidat@test.com',
          city: 'Montreal',
          isDeleted: false,
          createdById: creator.id,
        },
      });
      const prospect = await prisma.prospectCandidate.create({
        data: {
          firstName: 'Candidat',
          lastName: 'Confirme',
          phone: '5145557777',
          email: 'candidat@test.com',
          source: 'form-cv',
          isDeleted: false,
          isConverted: false,
        },
      });

      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({ first_name: 'Candidat', phone: '5145557777' });
      expect(res.status).toBe(200);
      expect(res.body.candidateId).toBe(cand.id);
      expect(res.body.message).toMatch(/Candidat/i);

      // La fiche prospect existante est liée au candidat (converti) pour
      // disparaître de la liste des Candidats Potentiels.
      const after = await prisma.prospectCandidate.findUnique({
        where: { id: prospect.id },
      });
      expect(after?.isConverted).toBe(true);
      expect(after?.convertedToId).toBe(cand.id);
    });
  });

  describe('POST /gohighlevel/survey-prospect (service mocké)', () => {
    it('mauvais secret → 401', async () => {
      const res = await request(app)
        .post(SURVEY_URL)
        .set('x-webhook-secret', 'mauvais')
        .send({ email: 'x@test.com' });
      expect(res.status).toBe(401);
    });

    it('ni email ni téléphone → 400', async () => {
      const res = await request(app)
        .post(SURVEY_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({ contact: {} });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/email ou téléphone/i);
      expect(surveySync.findSubmissionByContact).not.toHaveBeenCalled();
    });

    it('soumission introuvable côté API GHL → 202 (rattrapage planifié)', async () => {
      surveySync.findSubmissionByContact.mockResolvedValueOnce(null);

      const res = await request(app)
        .post(SURVEY_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({ email: 'introuvable@test.com', phone: '5145556666' });
      expect(res.status).toBe(202);
      expect(res.body.message).toMatch(/introuvable/i);
      expect(surveySync.findSubmissionByContact).toHaveBeenCalledWith(
        'introuvable@test.com',
        '5145556666'
      );
      // Pas de soumission → pas de synchro.
      expect(surveySync.syncOneSubmission).not.toHaveBeenCalled();
    });

    it('soumission trouvée → 200 + synchronisation déléguée au service', async () => {
      const fakeSubmission = { id: 'sub_123' };
      surveySync.findSubmissionByContact.mockResolvedValueOnce(fakeSubmission);
      surveySync.syncOneSubmission.mockResolvedValueOnce({ prospectId: 'p_1', action: 'created' });

      const res = await request(app)
        .post(SURVEY_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({ email: 'trouve@test.com' });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/synchronisé/i);
      expect(res.body.result).toEqual({ prospectId: 'p_1', action: 'created' });
      expect(surveySync.syncOneSubmission).toHaveBeenCalledWith(fakeSubmission);
    });
  });
});
