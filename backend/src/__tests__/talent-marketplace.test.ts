import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Marketplace talents — /api/marketplace (portail CLIENT).
 *
 * Toutes les routes passent par `authenticateClient` : on signe donc un token
 * role:'CLIENT' sur l'id d'un VRAI `prisma.client.create` (le middleware résout
 * le client par la table `clients`, pas `users` — sinon 401).
 *
 * Couvre :
 *  - garde d'auth (`authenticateClient`) : 401 sans token, 401 token non-CLIENT ;
 *  - validation (`searchTalentsByCity`) : 400 si `city` manquant ;
 *  - 404 : détail / vidéo / checkout d'un candidat inexistant ou non visible ;
 *  - 409-like (déjà acheté → 400) sur le checkout d'un candidat déjà acheté ;
 *  - chemins heureux : recherche par ville (anonymisée), détail avant/après achat
 *    (invariant : coordonnées seulement si acheté), URL vidéo signée (R2 mocké),
 *    liste des achats, et création de session Stripe (mockée).
 *
 * Services externes mockés (zéro réseau) : Stripe (`../services/stripe.service`)
 * et R2 (`getR2SignedUrl` de `../services/video.service`).
 */

// --- Mocks services externes ---------------------------------------------

const stripeSessionCreate = jest.fn();

jest.mock('../services/stripe.service', () => ({
  getStripe: () => ({
    checkout: { sessions: { create: stripeSessionCreate } },
  }),
  getClientAppUrl: () => 'https://app.test',
  getWebhookSecret: () => 'whsec_test',
}));

jest.mock('../services/video.service', () => ({
  // On conserve le vrai module (videoUpload/multer est utilisé au chargement par
  // candidate.routes) et on n'override QUE getR2SignedUrl (pas de réseau R2).
  ...jest.requireActual('../services/video.service'),
  getR2SignedUrl: jest.fn(async (key: string, expiresIn: number) =>
    `https://r2.test/signed/${key}?exp=${expiresIn}`
  ),
}));

// app importée APRÈS les jest.mock pour que le controller capte les versions mockées.
import { createApp } from '../app';

describe('Marketplace talents — /api/marketplace', () => {
  let app: Express;

  let clientToken: string; // token CLIENT valide (compte présent + actif)
  let clientId: string;
  let staffToken: string; // token role:'ADMIN' → rejeté (non-CLIENT)

  let createdById: string; // User FK requis par Candidate.createdById

  let candidateMtlId: string; // candidat visible à Montréal, avec vidéo
  let candidateNoVideoId: string; // candidat visible sans vidéo
  let hiddenCandidateId: string; // candidat NON visible (isArchived)
  let purchasedCandidateId: string; // candidat déjà acheté par le client

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();

    const pw = await hashPassword('Test1234');

    // Compte client portail réel (le middleware le résout par la table clients).
    const client = await prisma.client.create({
      data: { name: 'Client Portail', email: 'portail@marketplace.com', password: pw, isActive: true },
    });
    clientId = client.id;
    clientToken = generateAccessToken({ userId: client.id, email: client.email, role: 'CLIENT' });

    // Token staff (role non-CLIENT) → doit être refusé par authenticateClient (401).
    staffToken = generateAccessToken({ userId: 'staff-id', email: 'staff@x.com', role: 'ADMIN' });

    // User créateur requis par la FK Candidate.createdById.
    const creator = await prisma.user.create({
      data: { email: 'creator@marketplace.com', password: pw, firstName: 'Cre', lastName: 'Ator', role: 'ADMIN', isActive: true },
    });
    createdById = creator.id;

    // Candidat visible à Montréal, avec vidéo + clientNote, bonne note.
    const mtl = await prisma.candidate.create({
      data: {
        firstName: 'Marc', lastName: 'Tremblay', email: 'marc@cand.com', phone: '5145551111',
        city: 'Montréal', province: 'QC', status: 'EXCELLENT', globalRating: 9.2,
        clientNote: 'Excellent profil sécurité.', videoStoragePath: 'videos/marc.mp4',
        hasVehicle: true, available24_7: true, availableDays: true,
        isActive: true, isArchived: false, isDeleted: false, createdById,
      },
    });
    candidateMtlId = mtl.id;

    // Candidat visible à Montréal, SANS vidéo, note plus basse.
    const noVideo = await prisma.candidate.create({
      data: {
        firstName: 'Julie', lastName: 'Roy', email: 'julie@cand.com', phone: '5145552222',
        city: 'Montréal', province: 'QC', status: 'BON', globalRating: 8.1,
        hasVehicle: false, isActive: true, isArchived: false, isDeleted: false, createdById,
      },
    });
    candidateNoVideoId = noVideo.id;

    // Candidat NON visible (archivé) → ne doit jamais apparaître ni être accessible.
    const hidden = await prisma.candidate.create({
      data: {
        firstName: 'Cache', lastName: 'Ttte', phone: '5145553333',
        city: 'Montréal', province: 'QC', status: 'BON', globalRating: 7.5,
        isActive: true, isArchived: true, isDeleted: false, createdById,
      },
    });
    hiddenCandidateId = hidden.id;

    // Candidat déjà acheté par le client (pour 400 « déjà acheté » + coordonnées au détail).
    const purchased = await prisma.candidate.create({
      data: {
        firstName: 'Paul', lastName: 'Gagnon', email: 'paul@cand.com', phone: '5145554444',
        city: 'Laval', province: 'QC', status: 'TRES_BON', globalRating: 8.7,
        isActive: true, isArchived: false, isDeleted: false, createdById,
      },
    });
    purchasedCandidateId = purchased.id;

    await prisma.clientPurchase.create({
      data: { clientId, candidateId: purchased.id, type: 'EVALUATED', city: 'Laval', price: 30 },
    });

    // Tarification ville (le checkout lit CityPricing.evaluatedCandidatePrice).
    await prisma.cityPricing.create({
      data: { city: 'Montréal', province: 'QC', evaluatedCandidatePrice: 40 },
    });

    // Prospect (mode cvonly) — visible, non converti, non supprimé.
    await prisma.prospectCandidate.create({
      data: {
        firstName: 'Sam', lastName: 'Pros', phone: '5145559999',
        city: 'Montréal', province: 'QC', isConverted: false, isDeleted: false,
      },
    });
  });

  beforeEach(() => {
    stripeSessionCreate.mockReset();
  });

  // --- Garde d'authentification ------------------------------------------

  describe("garde d'authentification (authenticateClient)", () => {
    it('sans token → 401', async () => {
      const res = await request(app).get('/api/marketplace/talents').query({ city: 'Montréal' });
      expect(res.status).toBe(401);
    });

    it('token non-CLIENT (ADMIN) → 401', async () => {
      const res = await request(app)
        .get('/api/marketplace/talents')
        .query({ city: 'Montréal' })
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(401);
    });
  });

  // --- searchTalentsByCity -----------------------------------------------

  describe('GET /talents (searchTalentsByCity)', () => {
    it('sans paramètre city → 400', async () => {
      const res = await request(app)
        .get('/api/marketplace/talents')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/ville/i);
    });

    it('recherche par ville → candidats visibles, anonymisés (hasVideo/purchased, pas de videoStoragePath ni lastName)', async () => {
      const res = await request(app)
        .get('/api/marketplace/talents')
        .query({ city: 'Montréal' })
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.city).toBe('Montréal');
      const ids = res.body.data.map((c: any) => c.id);
      // candidats visibles présents, candidat archivé absent
      expect(ids).toEqual(expect.arrayContaining([candidateMtlId, candidateNoVideoId]));
      expect(ids).not.toContain(hiddenCandidateId);

      const marc = res.body.data.find((c: any) => c.id === candidateMtlId);
      // Anonymisation : on expose hasVideo (booléen) mais jamais la clé brute.
      expect(marc.hasVideo).toBe(true);
      expect(marc.videoStoragePath).toBeUndefined();
      // Pas de coordonnées dans la liste (firstName seulement).
      expect(marc.firstName).toBe('Marc');
      expect(marc.lastName).toBeUndefined();
      expect(marc.purchased).toBe(false);

      const julie = res.body.data.find((c: any) => c.id === candidateNoVideoId);
      expect(julie.hasVideo).toBe(false);
    });

    it('filtre hasVehicle=true → ne renvoie que les candidats avec véhicule', async () => {
      const res = await request(app)
        .get('/api/marketplace/talents')
        .query({ city: 'Montréal', hasVehicle: 'true' })
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((c: any) => c.id);
      expect(ids).toContain(candidateMtlId); // Marc a un véhicule
      expect(ids).not.toContain(candidateNoVideoId); // Julie non
    });

    it('mode=cvonly → renvoie les prospects mappés (status CV_ONLY)', async () => {
      const res = await request(app)
        .get('/api/marketplace/talents')
        .query({ city: 'Montréal', mode: 'cvonly' })
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.every((p: any) => p.status === 'CV_ONLY')).toBe(true);
      expect(res.body.data.some((p: any) => p.firstName === 'Sam')).toBe(true);
    });
  });

  // --- getTalentDetail ----------------------------------------------------

  describe('GET /talents/:id (getTalentDetail)', () => {
    it('candidat inexistant → 404', async () => {
      const res = await request(app)
        .get('/api/marketplace/talents/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(404);
    });

    it('candidat archivé → 404 (non visible au marketplace)', async () => {
      const res = await request(app)
        .get(`/api/marketplace/talents/${hiddenCandidateId}`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(404);
    });

    it('non acheté → détail SANS coordonnées (lastName/email/phone absents)', async () => {
      const res = await request(app)
        .get(`/api/marketplace/talents/${candidateMtlId}`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(candidateMtlId);
      expect(res.body.data.firstName).toBe('Marc');
      expect(res.body.data.hasVideo).toBe(true);
      expect(res.body.data.purchased).toBe(false);
      // Invariant confidentialité : pas de coordonnées avant achat.
      expect(res.body.data.lastName).toBeUndefined();
      expect(res.body.data.email).toBeUndefined();
      expect(res.body.data.phone).toBeUndefined();
      expect(res.body.data.videoStoragePath).toBeUndefined();
    });

    it('acheté → détail AVEC coordonnées (lastName/email/phone présents)', async () => {
      const res = await request(app)
        .get(`/api/marketplace/talents/${purchasedCandidateId}`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.purchased).toBe(true);
      expect(res.body.data.lastName).toBe('Gagnon');
      expect(res.body.data.email).toBe('paul@cand.com');
      expect(res.body.data.phone).toBe('5145554444');
    });
  });

  // --- getTalentVideoUrl --------------------------------------------------

  describe('GET /talents/:id/video (getTalentVideoUrl)', () => {
    it('candidat avec vidéo → URL signée R2 (service mocké)', async () => {
      const res = await request(app)
        .get(`/api/marketplace/talents/${candidateMtlId}/video`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.videoUrl).toContain('videos/marc.mp4');
      expect(res.body.data.expiresIn).toBe(3600);
    });

    it('candidat sans vidéo → 404 (Aucune vidéo)', async () => {
      const res = await request(app)
        .get(`/api/marketplace/talents/${candidateNoVideoId}/video`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(404);
    });
  });

  // --- getClientPurchases -------------------------------------------------

  describe('GET /purchases (getClientPurchases)', () => {
    it('renvoie les achats du client avec coordonnées du candidat', async () => {
      const res = await request(app)
        .get('/api/marketplace/purchases')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      const p = res.body.data[0];
      expect(p.candidate.id).toBe(purchasedCandidateId);
      expect(p.candidate.lastName).toBe('Gagnon');
      expect(p.candidate.email).toBe('paul@cand.com');
    });
  });

  // --- createCandidateCheckout (Stripe mocké) ----------------------------

  describe('POST /talents/:id/checkout (createCandidateCheckout)', () => {
    it('candidat inexistant → 404 (pas d\'appel Stripe)', async () => {
      const res = await request(app)
        .post('/api/marketplace/talents/00000000-0000-0000-0000-000000000000/checkout')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(404);
      expect(stripeSessionCreate).not.toHaveBeenCalled();
    });

    it('candidat déjà acheté → 400 (pas d\'appel Stripe)', async () => {
      const res = await request(app)
        .post(`/api/marketplace/talents/${purchasedCandidateId}/checkout`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/déjà acheté/i);
      expect(stripeSessionCreate).not.toHaveBeenCalled();
    });

    it('candidat disponible → 200 + URL Stripe ; prix tiré de CityPricing (40 → 4000 cents)', async () => {
      stripeSessionCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/sess_123' });
      const res = await request(app)
        .post(`/api/marketplace/talents/${candidateMtlId}/checkout`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(200);
      expect(res.body.url).toBe('https://checkout.stripe.test/sess_123');
      expect(stripeSessionCreate).toHaveBeenCalledTimes(1);

      const arg = stripeSessionCreate.mock.calls[0][0];
      expect(arg.mode).toBe('payment');
      // Montréal a un CityPricing à 40 $ → 4000 cents.
      expect(arg.line_items[0].price_data.unit_amount).toBe(4000);
      expect(arg.metadata).toMatchObject({ clientId, candidateId: candidateMtlId, city: 'Montréal' });
    });
  });
});
