import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';

/**
 * Webhook Stripe — POST /api/webhooks/stripe (controllers/stripe-webhook.controller).
 *
 * Route montée DIRECTEMENT dans app.ts (avant express.json) avec
 * `express.raw({ type: 'application/json' })` : pas de middleware d'auth, pas de
 * schéma Zod. La SÉCURITÉ repose entièrement sur la vérification de signature
 * Stripe (`stripe.webhooks.constructEvent`). Le webhook est la SOURCE DE VÉRITÉ
 * de l'achat : sur `checkout.session.completed`, il upsert un ClientPurchase.
 *
 * Stratégie de mock (zéro réseau réel) :
 *  - on mocke `../services/stripe.service` pour contrôler `constructEvent`
 *    (fabriquer des events factices / simuler une signature invalide) et fixer
 *    un secret de webhook ;
 *  - `getStripe().webhooks.constructEvent` lit le mock partagé `constructEventMock`
 *    déclaré ci-dessous, ce qui permet de redéfinir son comportement par cas.
 *
 * Couvre :
 *  - signature invalide → 400 (constructEvent lève) ;
 *  - chemin heureux `checkout.session.completed` → 200 + ClientPurchase créé,
 *    prix = amount_total/100 (source de vérité = montant encaissé) ;
 *  - idempotence : même event rejoué → un seul ClientPurchase ;
 *  - metadata clientId/candidateId manquantes → 200 mais AUCUN achat créé ;
 *  - fallback prix sur metadata.price quand amount_total absent ;
 *  - type d'event ignoré (ex. payment_intent.succeeded) → 200, rien créé ;
 *  - erreur DB pendant l'upsert → 500 (pour que Stripe REJOUE l'event).
 */

// Mock partagé, redéfini par cas via mockImplementation.
const constructEventMock = jest.fn();

jest.mock('../services/stripe.service', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: constructEventMock },
  }),
  getWebhookSecret: () => 'whsec_test_secret',
}));

// app importé APRÈS le mock pour que le controller capte le service mocké.
import { createApp } from '../app';

const ENDPOINT = '/api/webhooks/stripe';

// Petit helper : POST du body brut (le controller reçoit express.raw → Buffer).
const postRaw = (app: Express, body: object) =>
  request(app)
    .post(ENDPOINT)
    .set('Content-Type', 'application/json')
    .set('stripe-signature', 't=1,v1=fake')
    .send(Buffer.from(JSON.stringify(body)));

describe('Webhook Stripe — POST /api/webhooks/stripe', () => {
  let app: Express;
  let clientId: string;
  let candidateId: string;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    constructEventMock.mockReset();

    const client = await prisma.client.create({
      data: { name: 'Acheteur Inc', email: 'acheteur@stripe.test', isActive: true },
    });
    clientId = client.id;

    // Candidate.createdBy est une relation requise → on sème un User.
    const creator = await prisma.user.create({
      data: {
        email: 'creator@stripe.test',
        password: 'x',
        firstName: 'Crea',
        lastName: 'Tor',
        role: 'ADMIN',
        isActive: true,
      },
    });

    const candidate = await prisma.candidate.create({
      data: {
        firstName: 'Jean',
        lastName: 'Test',
        phone: '5145550000',
        city: 'Montréal',
        createdById: creator.id,
      },
    });
    candidateId = candidate.id;
  });

  it('signature invalide → 400 et aucun achat', async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });

    const res = await postRaw(app, { fake: true });

    expect(res.status).toBe(400);
    expect(res.text).toMatch(/Webhook Error/);
    expect(await prisma.clientPurchase.count()).toBe(0);
  });

  it('checkout.session.completed → 200 + ClientPurchase créé (prix = amount_total/100)', async () => {
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          amount_total: 12500, // 125.00 $ encaissés
          metadata: { clientId, candidateId, city: 'Laval', price: '99' },
        },
      },
    });

    const res = await postRaw(app, {});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    const purchase = await prisma.clientPurchase.findUnique({
      where: { clientId_candidateId: { clientId, candidateId } },
    });
    expect(purchase).not.toBeNull();
    expect(purchase?.type).toBe('EVALUATED');
    expect(purchase?.city).toBe('Laval');
    // Source de vérité = amount_total (125.00), PAS metadata.price (99).
    expect(Number(purchase?.price)).toBe(125);
  });

  it('même event rejoué → idempotent (un seul ClientPurchase)', async () => {
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_replay',
          amount_total: 5000,
          metadata: { clientId, candidateId, city: 'Québec' },
        },
      },
    });

    const first = await postRaw(app, {});
    const second = await postRaw(app, {});

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const count = await prisma.clientPurchase.count({ where: { clientId, candidateId } });
    expect(count).toBe(1);
  });

  it('metadata clientId/candidateId manquantes → 200 mais aucun achat', async () => {
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_nometa',
          amount_total: 8000,
          metadata: { city: 'Gatineau' }, // ni clientId ni candidateId
        },
      },
    });

    const res = await postRaw(app, {});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(await prisma.clientPurchase.count()).toBe(0);
  });

  it('amount_total absent → fallback sur metadata.price', async () => {
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_fallback',
          // pas d'amount_total
          metadata: { clientId, candidateId, city: 'Sherbrooke', price: '149.50' },
        },
      },
    });

    const res = await postRaw(app, {});

    expect(res.status).toBe(200);
    const purchase = await prisma.clientPurchase.findUnique({
      where: { clientId_candidateId: { clientId, candidateId } },
    });
    expect(Number(purchase?.price)).toBe(149.5);
  });

  it("type d'event ignoré (payment_intent.succeeded) → 200, rien créé", async () => {
    constructEventMock.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test_1', metadata: { clientId, candidateId } } },
    });

    const res = await postRaw(app, {});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(await prisma.clientPurchase.count()).toBe(0);
  });

  it('erreur DB pendant le traitement → 500 (Stripe rejouera)', async () => {
    // clientId valide mais candidateId inexistant → l'upsert viole la FK
    // candidate_id → 500 (volontaire : Stripe rejoue plutôt que perdre l'achat).
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_fk',
          amount_total: 10000,
          metadata: {
            clientId,
            candidateId: '00000000-0000-0000-0000-000000000000', // FK absente
            city: 'Trois-Rivières',
          },
        },
      },
    });

    const res = await postRaw(app, {});

    expect(res.status).toBe(500);
    expect(res.text).toMatch(/Webhook handler failed/);
    expect(await prisma.clientPurchase.count()).toBe(0);
  });
});
