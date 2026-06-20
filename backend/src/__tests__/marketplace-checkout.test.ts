import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Checkout marketplace — POST /api/marketplace/talents/:id/checkout
 * (src/controllers/marketplace-checkout.controller.ts → createCandidateCheckout)
 *
 * La route est montée sous `/api/marketplace` (app.ts) via
 * talent-marketplace.routes.ts, derrière `authenticateClient` (router.use) :
 * token JWT requis ET role === 'CLIENT' ET client présent/actif dans la table
 * `clients` (sinon 401). On signe donc le token sur l'id d'un vrai
 * prisma.client.create(...).
 *
 * SERVICE EXTERNE MOCKÉ : `../services/stripe.service` (getStripe +
 * getClientAppUrl). Aucun appel réseau réel à Stripe. On capte les arguments
 * passés à stripe.checkout.sessions.create pour vérifier mode/devise/montant/
 * metadata, et on renvoie une URL factice de session.
 *
 * Couvre :
 *  - auth : 401 sans token, 401 avec token ADMIN (role !== CLIENT),
 *    401 avec token CLIENT signé sur un id inexistant ;
 *  - 404 : candidat introuvable, candidat archivé/inactif (hors MARKETPLACE_WHERE) ;
 *  - 400 : candidat déjà acheté (ClientPurchase existant) ;
 *  - chemins heureux : prix issu de CityPricing (évalué) ; prix par défaut (30 $)
 *    quand aucune CityPricing pour la ville. Assertions réelles sur l'URL
 *    retournée et sur les arguments transmis à Stripe.
 */

// Capture les arguments du dernier appel + URL factice configurable.
const createSessionMock = jest.fn();

jest.mock('../services/stripe.service', () => ({
  getStripe: jest.fn(() => ({
    checkout: { sessions: { create: createSessionMock } },
  })),
  getClientAppUrl: jest.fn(() => 'https://app.test.local'),
}));

describe('Marketplace checkout — POST /api/marketplace/talents/:id/checkout', () => {
  let app: Express;

  let clientToken: string; // compte portail (role CLIENT) résolu via prisma.client
  let adminToken: string; // staff ADMIN (role !== CLIENT)
  let ghostClientToken: string; // token CLIENT signé sur un id sans ligne client

  let clientId: string;
  let staffUserId: string; // Candidate.createdById (FK requise vers users)

  let evaluatedCandidateId: string; // ville avec CityPricing connue
  let defaultPriceCandidateId: string; // ville sans CityPricing → défaut 30 $
  let archivedCandidateId: string; // hors MARKETPLACE_WHERE → 404
  let alreadyPurchasedCandidateId: string; // ClientPurchase existant → 400

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    // Staff requis : Candidate.createdById est une FK NOT NULL vers users.
    const staff = await prisma.user.create({
      data: {
        email: 'staff.mcheckout@test.com',
        password: pw,
        firstName: 'Staff',
        lastName: 'Createur',
        role: 'ADMIN',
        isActive: true,
      },
    });
    staffUserId = staff.id;
    adminToken = generateAccessToken({ userId: staff.id, email: staff.email!, role: staff.role });

    // Compte client portail (role CLIENT résolu via la table clients).
    const clientAccount = await prisma.client.create({
      data: { name: 'Acme Checkout', email: 'checkout@client.com', password: pw, isActive: true },
    });
    clientId = clientAccount.id;
    clientToken = generateAccessToken({ userId: clientAccount.id, email: clientAccount.email, role: 'CLIENT' });

    // Token CLIENT valide cryptographiquement mais sans client en base → 401.
    ghostClientToken = generateAccessToken({
      userId: '00000000-0000-0000-0000-000000000000',
      email: 'ghost@client.com',
      role: 'CLIENT',
    });

    // Tarification connue pour Montreal (le contrôleur lit evaluatedCandidatePrice).
    await prisma.cityPricing.create({
      data: { city: 'Montreal', province: 'QC', evaluatedCandidatePrice: 42, cvOnlyPrice: 8 },
    });

    // Candidat disponible (isActive, !isDeleted, !isArchived) à Montreal.
    const evaluated = await prisma.candidate.create({
      data: {
        firstName: 'Eval',
        lastName: 'Candidat',
        phone: '5140000001',
        city: 'Montreal',
        province: 'QC',
        createdById: staffUserId,
        isActive: true,
      },
    });
    evaluatedCandidateId = evaluated.id;

    // Candidat dans une ville SANS CityPricing → prix défaut 30 $.
    const defaultPrice = await prisma.candidate.create({
      data: {
        firstName: 'Sans',
        lastName: 'Tarif',
        phone: '5140000002',
        city: 'Sherbrooke',
        province: 'QC',
        createdById: staffUserId,
        isActive: true,
      },
    });
    defaultPriceCandidateId = defaultPrice.id;

    // Candidat archivé → hors MARKETPLACE_WHERE → 404.
    const archived = await prisma.candidate.create({
      data: {
        firstName: 'Archive',
        lastName: 'Candidat',
        phone: '5140000003',
        city: 'Montreal',
        province: 'QC',
        createdById: staffUserId,
        isActive: true,
        isArchived: true,
      },
    });
    archivedCandidateId = archived.id;

    // Candidat déjà acheté par ce client (ClientPurchase) → 400.
    const purchased = await prisma.candidate.create({
      data: {
        firstName: 'Deja',
        lastName: 'Achete',
        phone: '5140000004',
        city: 'Montreal',
        province: 'QC',
        createdById: staffUserId,
        isActive: true,
      },
    });
    alreadyPurchasedCandidateId = purchased.id;
    await prisma.clientPurchase.create({
      data: {
        clientId,
        candidateId: purchased.id,
        type: 'EVALUATED',
        city: 'Montreal',
        price: 42,
      },
    });
  });

  beforeEach(() => {
    createSessionMock.mockReset();
    createSessionMock.mockResolvedValue({ url: 'https://stripe.test/checkout/session_123' });
  });

  describe("garde d'authentification", () => {
    it('POST sans token → 401', async () => {
      const res = await request(app).post(`/api/marketplace/talents/${evaluatedCandidateId}/checkout`);
      expect(res.status).toBe(401);
      expect(createSessionMock).not.toHaveBeenCalled();
    });

    it('POST avec token ADMIN (role !== CLIENT) → 401', async () => {
      const res = await request(app)
        .post(`/api/marketplace/talents/${evaluatedCandidateId}/checkout`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(401);
      expect(createSessionMock).not.toHaveBeenCalled();
    });

    it('POST avec token CLIENT mais client inexistant en base → 401', async () => {
      const res = await request(app)
        .post(`/api/marketplace/talents/${evaluatedCandidateId}/checkout`)
        .set('Authorization', `Bearer ${ghostClientToken}`);
      expect(res.status).toBe(401);
      expect(createSessionMock).not.toHaveBeenCalled();
    });
  });

  describe('404 — candidat non disponible', () => {
    it('candidat inexistant → 404', async () => {
      const res = await request(app)
        .post('/api/marketplace/talents/00000000-0000-0000-0000-000000000000/checkout')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(404);
      expect(createSessionMock).not.toHaveBeenCalled();
    });

    it('candidat archivé (hors MARKETPLACE_WHERE) → 404', async () => {
      const res = await request(app)
        .post(`/api/marketplace/talents/${archivedCandidateId}/checkout`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(404);
      expect(createSessionMock).not.toHaveBeenCalled();
    });
  });

  describe('400 — déjà acheté', () => {
    it('candidat déjà acheté par ce client → 400, pas de session Stripe', async () => {
      const res = await request(app)
        .post(`/api/marketplace/talents/${alreadyPurchasedCandidateId}/checkout`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/déjà acheté/i);
      expect(createSessionMock).not.toHaveBeenCalled();
    });
  });

  describe('chemins heureux — création de session Stripe', () => {
    it('candidat avec CityPricing → session créée, URL renvoyée, montant = prix évalué', async () => {
      const res = await request(app)
        .post(`/api/marketplace/talents/${evaluatedCandidateId}/checkout`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.url).toBe('https://stripe.test/checkout/session_123');

      // Stripe a bien été appelé une fois avec les bons paramètres.
      expect(createSessionMock).toHaveBeenCalledTimes(1);
      const args = createSessionMock.mock.calls[0][0];
      expect(args.mode).toBe('payment');

      const line = args.line_items[0];
      expect(line.price_data.currency).toBe('cad');
      // evaluatedCandidatePrice = 42 → unit_amount en cents = 4200.
      expect(line.price_data.unit_amount).toBe(4200);
      expect(line.quantity).toBe(1);

      // metadata transmise (clientId / candidateId / price).
      expect(args.metadata.clientId).toBe(clientId);
      expect(args.metadata.candidateId).toBe(evaluatedCandidateId);
      expect(args.metadata.price).toBe('42');
      expect(args.metadata.city).toBe('Montreal');

      // URLs success/cancel construites depuis getClientAppUrl() mocké.
      expect(args.success_url).toContain('https://app.test.local');
      expect(args.cancel_url).toContain('purchase=cancel');
    });

    it('candidat sans CityPricing pour sa ville → prix par défaut 30 $ (3000 cents)', async () => {
      const res = await request(app)
        .post(`/api/marketplace/talents/${defaultPriceCandidateId}/checkout`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(createSessionMock).toHaveBeenCalledTimes(1);
      const args = createSessionMock.mock.calls[0][0];
      expect(args.line_items[0].price_data.unit_amount).toBe(3000);
      expect(args.metadata.price).toBe('30');
      expect(args.metadata.city).toBe('Sherbrooke');
    });
  });
});
