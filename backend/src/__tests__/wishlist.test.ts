import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Wishlist / panier client — /api/wishlist.
 *
 * Toutes les routes passent par `authenticateJWT` (et non `authenticateStaff`),
 * puis le contrôleur fait lui-même le contrôle de rôle :
 *  - endpoints CLIENT (panier) : `role === 'CLIENT'` sinon 401 ;
 *  - endpoints ADMIN (/admin/*) : `role === 'ADMIN'` sinon 403.
 *
 * PIÈGE : un token role:'CLIENT' est résolu par passport via la table `clients`
 * (pas `users`). Le token client est donc signé sur l'id d'un vrai
 * prisma.client.create(...), sinon passport renverrait 401 (client introuvable).
 *
 * Couvre :
 *  - auth : 401 sans token, 401 quand un ADMIN frappe un endpoint CLIENT,
 *    403 quand un CLIENT frappe un endpoint ADMIN ;
 *  - validation (400) via le middleware Zod : type invalide, quantité < 1,
 *    status admin invalide ;
 *  - 404 : item inexistant, wishlist admin inexistante ;
 *  - chemins heureux réels : ajout d'item au panier avec calcul du prix via
 *    cityPricing + total, soumission du panier (DRAFT → SUBMITTED), liste admin
 *    avec stats.
 */
describe('Wishlist — /api/wishlist', () => {
  let app: Express;

  let clientToken: string; // compte portail (role CLIENT) résolu via prisma.client
  let adminToken: string; // staff ADMIN résolu via prisma.user

  let clientId: string;
  let submittedWishlistId: string; // wishlist d'un autre client, visible côté admin

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    // Tarification connue pour Montréal — le contrôleur l'utilise pour le prix.
    await prisma.cityPricing.create({
      data: {
        city: 'Montreal',
        province: 'QC',
        evaluatedCandidatePrice: 40,
        cvOnlyPrice: 8,
      },
    });

    const clientAccount = await prisma.client.create({
      data: { name: 'Acme Panier', email: 'panier@client.com', password: pw, isActive: true },
    });
    clientId = clientAccount.id;
    clientToken = generateAccessToken({ userId: clientAccount.id, email: clientAccount.email, role: 'CLIENT' });

    const otherClient = await prisma.client.create({
      data: { name: 'Autre Client', email: 'autre@client.com', password: pw, isActive: true },
    });

    const admin = await prisma.user.create({
      data: { email: 'admin.wishlist@test.com', password: pw, firstName: 'Admin', lastName: 'Staff', role: 'ADMIN', isActive: true },
    });
    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });

    // Une wishlist SOUMISE appartenant à l'autre client, pour la liste/détail admin.
    const submitted = await prisma.clientWishlist.create({
      data: {
        clientId: otherClient.id,
        status: 'SUBMITTED',
        totalAmount: 80,
        submittedAt: new Date(),
        items: {
          create: [
            { city: 'Montreal', province: 'QC', type: 'EVALUATED', quantity: 2, unitPrice: 40, totalPrice: 80 },
          ],
        },
      },
    });
    submittedWishlistId = submitted.id;
  });

  describe("garde d'authentification", () => {
    it('GET / sans token → 401', async () => {
      const res = await request(app).get('/api/wishlist');
      expect(res.status).toBe(401);
    });

    it('GET / avec token ADMIN (pas CLIENT) → 401 (endpoint réservé au portail client)', async () => {
      const res = await request(app)
        .get('/api/wishlist')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(401);
    });

    it('GET /admin/all avec token CLIENT → 403 (admin uniquement)', async () => {
      const res = await request(app)
        .get('/api/wishlist/admin/all')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('validation (400)', () => {
    it('POST /items type invalide → 400', async () => {
      const res = await request(app)
        .post('/api/wishlist/items')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ city: 'Montreal', type: 'PREMIUM', quantity: 1 });
      expect(res.status).toBe(400);
    });

    it('POST /items quantité < 1 → 400', async () => {
      const res = await request(app)
        .post('/api/wishlist/items')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ city: 'Montreal', type: 'EVALUATED', quantity: 0 });
      expect(res.status).toBe(400);
    });

    it('PUT /admin/:id/status status invalide → 400', async () => {
      const res = await request(app)
        .put(`/api/wishlist/admin/${submittedWishlistId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'INCONNU' });
      expect(res.status).toBe(400);
    });
  });

  describe('404 / ownership', () => {
    it('PUT /items/:id inexistant → 404', async () => {
      const res = await request(app)
        .put('/api/wishlist/items/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ quantity: 3 });
      expect(res.status).toBe(404);
    });

    it('GET /admin/:id inexistant → 404', async () => {
      const res = await request(app)
        .get('/api/wishlist/admin/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('chemins heureux', () => {
    it('POST /items (CLIENT) → crée le panier, applique cityPricing et calcule le total', async () => {
      const res = await request(app)
        .post('/api/wishlist/items')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ city: 'Montreal', type: 'EVALUATED', quantity: 2 });

      expect(res.status).toBe(200);
      // unitPrice = evaluatedCandidatePrice (40) ; total = 40 * 2 = 80.
      expect(Number(res.body.item.unitPrice)).toBe(40);
      expect(Number(res.body.item.totalPrice)).toBe(80);
      expect(res.body.wishlist.status).toBe('DRAFT');
      expect(res.body.wishlist.items).toHaveLength(1);
      expect(Number(res.body.wishlist.totalAmount)).toBe(80);

      // Persistance réelle : une wishlist DRAFT existe pour ce client.
      const draft = await prisma.clientWishlist.findFirst({
        where: { clientId, status: 'DRAFT' },
        include: { items: true },
      });
      expect(draft).not.toBeNull();
      expect(draft!.items).toHaveLength(1);
    });

    it('POST /submit (CLIENT) → DRAFT devient SUBMITTED avec submittedAt', async () => {
      const res = await request(app)
        .post('/api/wishlist/submit')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.wishlist.status).toBe('SUBMITTED');
      expect(res.body.wishlist.submittedAt).not.toBeNull();

      const after = await prisma.clientWishlist.findFirst({
        where: { clientId },
        orderBy: { updatedAt: 'desc' },
      });
      expect(after!.status).toBe('SUBMITTED');
    });

    it('GET /admin/all (ADMIN) → liste les wishlists avec stats', async () => {
      const res = await request(app)
        .get('/api/wishlist/admin/all')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.wishlists)).toBe(true);
      // Au moins la wishlist seedée + celle soumise plus haut.
      expect(res.body.count).toBeGreaterThanOrEqual(2);
      expect(res.body.stats.submitted).toBeGreaterThanOrEqual(2);
      const ids = res.body.wishlists.map((w: any) => w.id);
      expect(ids).toContain(submittedWishlistId);
    });
  });
});
