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
 *  - survey : 400 sans email/téléphone, 202 quand la soumission est introuvable ;
 *  - contact GHL en double (téléphone vide) : numéro repris de la soumission ;
 *  - renvoi du formulaire avec un autre CV : CV mis à jour au lieu de 409.
 *
 * Services externes MOCKÉS (zéro réseau réel) :
 *  - ../services/survey-sync.service  (API GHL : findSubmissionByContact / syncOneSubmission)
 *  - ../utils/ghlFetch + ../services/r2.service (téléchargement vidéo + R2),
 *    chargés en `require()` paresseux dans le contrôleur seulement si video_url ;
 *  - axios (Nominatim) : le géocodage à la création ne doit jamais sortir en CI ;
 *  - ../services/ghl.client (findSubmittedPhoneByEmail) : recherche du téléphone
 *    dans les soumissions GHL quand le contact n'en a pas.
 */

// Le secret DOIT être en place AVANT que le contrôleur ne le lise (à la requête).
const WEBHOOK_SECRET = 'test-webhook-secret-value-123';
process.env.GOHIGHLEVEL_WEBHOOK_SECRET = WEBHOOK_SECRET;

// Mocks des services externes — déclarés avant l'import de createApp.
// axios : le webhook géocode désormais la fiche à la création. Les villes des
// tests viennent toutes du seed statique (aucun appel réel attendu), mais on
// coupe le réseau pour de bon — un géocodage de fond non awaité ne doit jamais
// partir vers Nominatim depuis la CI.
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: [] }) },
}));
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
jest.mock('../services/ghl.client', () => ({
  ...jest.requireActual('../services/ghl.client'),
  isGhlConfigured: jest.fn(() => true),
  findSubmittedPhoneByEmail: jest.fn(async () => null),
}));

import { createApp } from '../app';
const surveySync = require('../services/survey-sync.service');
const ghlClient = require('../services/ghl.client');

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

  describe('POST /gohighlevel/prospect — disponibilités', () => {
    it('décode le champ « Disponibilités » du formulaire vers les colonnes', async () => {
      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({
          first_name: 'Dispo',
          last_name: 'Reconnue',
          phone: '5145550301',
          disponibilites: ['soir', 'Fin de semaine'],
        });
      expect(res.status).toBe(201);

      const inDb = await prisma.prospectCandidate.findUnique({ where: { id: res.body.prospectId } });
      expect(inDb).toMatchObject({
        availableEvenings: true,
        availableWeekends: true,
        availableDays: false,
        availableNights: false,
      });
    });

    it('« 24/7 » implique les quatre quarts', async () => {
      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({ first_name: 'Dispo', last_name: 'Totale', phone: '5145550302', disponibilites: '24/7' });
      expect(res.status).toBe(201);

      const inDb = await prisma.prospectCandidate.findUnique({ where: { id: res.body.prospectId } });
      expect(inDb).toMatchObject({
        available24_7: true,
        availableDays: true,
        availableEvenings: true,
        availableNights: true,
        availableWeekends: true,
      });
    });

    it('champ absent → aucune disponibilité écrite, création inchangée', async () => {
      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({ first_name: 'Sans', last_name: 'Dispo', phone: '5145550303' });
      expect(res.status).toBe(201);

      const inDb = await prisma.prospectCandidate.findUnique({ where: { id: res.body.prospectId } });
      expect(inDb).toMatchObject({
        available24_7: false,
        availableDays: false,
        availableEvenings: false,
        availableNights: false,
        availableWeekends: false,
      });
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

  describe('POST /gohighlevel/prospect — géocodage à la création', () => {
    // Le formulaire GHL est la porte d'entrée de la majorité des CV. Tant que ce
    // webhook ne géocodait pas, les fiches n'avaient AUCUNE coordonnée et
    // restaient invisibles sur la carte des Candidats Potentiels jusqu'au
    // prochain backfill manuel — 131 fiches en attente au 2026-08-25, dont 114
    // arrivées après le dernier rattrapage.
    it('code postal fourni → fiche placée par le secteur postal', async () => {
      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({
          first_name: 'Geo',
          last_name: 'Postal',
          email: 'geo.postal@test.com',
          phone: '5145559001',
          city: 'Montréal',
          postal_code: 'H2X 1Y4',
          state: 'QC',
        });
      expect(res.status).toBe(201);

      const inDb = await prisma.prospectCandidate.findUnique({ where: { id: res.body.prospectId } });
      expect(inDb?.lat).not.toBeNull();
      expect(inDb?.lng).not.toBeNull();
      expect(inDb?.geocodeSource).toBe('postal');
      expect(inDb?.geocodedAt).toBeInstanceOf(Date);
    });

    it('sans code postal, ville connue → fiche placée par le centre-ville', async () => {
      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({
          first_name: 'Geo',
          last_name: 'Ville',
          email: 'geo.ville@test.com',
          phone: '5145559002',
          city: 'Laval',
          state: 'QC',
        });
      expect(res.status).toBe(201);

      const inDb = await prisma.prospectCandidate.findUnique({ where: { id: res.body.prospectId } });
      expect(inDb?.geocodeSource).toBe('city');
      expect(inDb?.lat).toBeCloseTo(45.6066, 2);
    });

    it('adresse inexploitable → prospect créé quand même, simplement non placé', async () => {
      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({
          first_name: 'Geo',
          last_name: 'Sans',
          email: 'geo.sans@test.com',
          phone: '5145559003',
        });
      expect(res.status).toBe(201);

      const inDb = await prisma.prospectCandidate.findUnique({ where: { id: res.body.prospectId } });
      expect(inDb).not.toBeNull(); // un CV ne se perd JAMAIS faute d'adresse
      expect(inDb?.lat).toBeNull();
      expect(inDb?.geocodedAt).toBeNull();
    });
  });

  describe('POST /gohighlevel/prospect — vidéo téléversée sur /ma-video', () => {
    /**
     * La course que ce webhook doit absorber : le candidat est redirigé vers
     * /ma-video dès l'envoi du formulaire et peut terminer sa vidéo AVANT que
     * ce webhook n'arrive. L'upload attend alors dans pending_video_uploads.
     */
    it('un upload en attente est rattaché au prospect créé', async () => {
      await prisma.pendingVideoUpload.create({
        data: {
          ghlContactId: 'contactEnAttente1',
          email: 'course@test.com',
          phone: '+15145556001',
          storagePath: 'videos/inbox/contactEnAttente1/presentation.mp4',
        },
      });

      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({ first_name: 'Course', phone: '514-555-6001', email: 'course@test.com' });

      expect(res.status).toBe(201);
      const inDb = await prisma.prospectCandidate.findUnique({ where: { id: res.body.prospectId } });
      expect(inDb?.videoStoragePath).toBe('videos/inbox/contactEnAttente1/presentation.mp4');
    });

    it("le téléversement direct l'emporte sur l'ancien champ vidéo de GHL", async () => {
      await prisma.pendingVideoUpload.create({
        data: {
          ghlContactId: 'contactEnAttente2',
          email: 'priorite@test.com',
          storagePath: 'videos/inbox/contactEnAttente2/grande-video.mp4',
        },
      });

      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({
          first_name: 'Priorite',
          phone: '5145556002',
          email: 'priorite@test.com',
          video_url: 'https://ghl.example/petite-video-50mo.mp4',
        });

      expect(res.status).toBe(201);
      const inDb = await prisma.prospectCandidate.findUnique({ where: { id: res.body.prospectId } });
      expect(inDb?.videoStoragePath).toBe('videos/inbox/contactEnAttente2/grande-video.mp4');
      // Le fichier plafonné à 50 Mo n'est même pas téléchargé.
      const r2 = require('../services/r2.service');
      expect(r2.uploadBufferToR2).not.toHaveBeenCalled();
    });

    it('un échec de réclamation ne fait pas échouer la création du prospect', async () => {
      const pendingService = require('../services/pending-video.service');
      const spy = jest
        .spyOn(pendingService, 'claimForProspect')
        .mockRejectedValueOnce(new Error('base indisponible'));

      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({ first_name: 'Resilient', phone: '5145556003' });

      expect(res.status).toBe(201);
      expect(res.body.prospectId).toBeDefined();
      spy.mockRestore();
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

  describe('POST /gohighlevel/prospect — renvoi du formulaire avec un autre CV', () => {
    it('prospect existant + nouveau CV → 200, CV remplacé et fiche remontée', async () => {
      const before = new Date('2026-09-01T12:00:00Z');
      const existing = await prisma.prospectCandidate.create({
        data: {
          firstName: 'Renvoi',
          lastName: 'Cv',
          phone: '5145552020',
          email: 'renvoi@test.com',
          source: 'form-cv',
          cvUrl: 'https://services.leadconnectorhq.com/documents/download/ancien',
          cvStoragePath: 'cvs/prospects/ancien.pdf',
          submissionDate: before,
        },
      });

      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({
          first_name: 'Renvoi',
          email: 'renvoi@test.com',
          phone: '5145552020',
          cv_url: 'https://services.leadconnectorhq.com/documents/download/nouveau',
          disponibilites: ['Soir', 'Fin de semaine'],
        });
      expect(res.status).toBe(200);
      expect(res.body.prospectId).toBe(existing.id);

      const after = await prisma.prospectCandidate.findUnique({ where: { id: existing.id } });
      expect(after?.cvUrl).toBe('https://services.leadconnectorhq.com/documents/download/nouveau');
      // La copie R2 passe avant cvUrl à l'affichage : elle doit disparaître,
      // sinon l'ancien CV resterait celui qu'on voit.
      expect(after?.cvStoragePath).toBeNull();
      expect(after!.submissionDate!.getTime()).toBeGreaterThan(before.getTime());
      expect(after?.availableEvenings).toBe(true);
      expect(after?.availableWeekends).toBe(true);
      expect(await prisma.prospectCandidate.count({ where: { phone: '5145552020' } })).toBe(1);
    });

    it('même CV qu’avant → 409, rien ne change', async () => {
      const cvUrl = 'https://services.leadconnectorhq.com/documents/download/meme';
      const existing = await prisma.prospectCandidate.create({
        data: { firstName: 'Meme', lastName: 'Cv', phone: '5145552121', source: 'form-cv', cvUrl },
      });

      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({ first_name: 'Meme', phone: '5145552121', cv_url: cvUrl });
      expect(res.status).toBe(409);

      const after = await prisma.prospectCandidate.findUnique({ where: { id: existing.id } });
      expect(after?.updatedAt.getTime()).toBe(existing.updatedAt.getTime());
    });

    it('fiche déjà convertie → 409, on ne touche pas au CV', async () => {
      const existing = await prisma.prospectCandidate.create({
        data: {
          firstName: 'Converti',
          lastName: 'Ancien',
          phone: '5145552222',
          source: 'form-cv',
          cvUrl: 'https://services.leadconnectorhq.com/documents/download/v1',
          isConverted: true,
        },
      });

      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({
          first_name: 'Converti',
          phone: '5145552222',
          cv_url: 'https://services.leadconnectorhq.com/documents/download/v2',
        });
      expect(res.status).toBe(409);
      const after = await prisma.prospectCandidate.findUnique({ where: { id: existing.id } });
      expect(after?.cvUrl).toBe('https://services.leadconnectorhq.com/documents/download/v1');
    });
  });

  describe('POST /gohighlevel/prospect — téléphone resté sur un contact GHL en double', () => {
    it('téléphone vide → repris de la soumission GHL → 201', async () => {
      ghlClient.findSubmittedPhoneByEmail.mockResolvedValueOnce('+15145553030');

      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({
          first_name: 'Double',
          last_name: 'Contact',
          email: 'double@test.com',
          phone: '',
          cv_url: 'https://services.leadconnectorhq.com/documents/download/cv',
        });
      expect(res.status).toBe(201);
      expect(ghlClient.findSubmittedPhoneByEmail).toHaveBeenCalledWith('double@test.com');

      const inDb = await prisma.prospectCandidate.findUnique({ where: { id: res.body.prospectId } });
      expect(inDb?.phone).toBe('+15145553030');
      expect(inDb?.email).toBe('double@test.com');
    });

    it('rien dans la soumission non plus → 400 comme avant', async () => {
      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({ first_name: 'Introuvable', email: 'introuvable@test.com' });
      expect(res.status).toBe(400);
      expect(res.body.received).toEqual({ hasFirstName: true, hasPhone: false });
    });

    it('GHL en panne → 400 propre, pas de 500', async () => {
      ghlClient.findSubmittedPhoneByEmail.mockRejectedValueOnce(new Error('GHL /forms/submissions → 503'));

      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({ first_name: 'Panne', email: 'panne@test.com' });
      expect(res.status).toBe(400);
    });

    it('le téléphone est déjà là → aucune recherche GHL', async () => {
      const res = await request(app)
        .post(PROSPECT_URL)
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({ first_name: 'Normal', email: 'normal@test.com', phone: '5145553131' });
      expect(res.status).toBe(201);
      expect(ghlClient.findSubmittedPhoneByEmail).not.toHaveBeenCalled();
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
