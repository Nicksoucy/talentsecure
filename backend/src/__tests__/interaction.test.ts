import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Journal d'interactions client — /api/clients/:clientId/interactions.
 *
 * Le routeur est monté en sous-routeur de client.routes.ts avec
 * { mergeParams: true } ; toutes les routes passent par `authenticateStaff`
 * (donc 401 sans token, 403 pour un token CLIENT), puis par `authorizeRoles`
 * pour l'écriture (POST: ADMIN/SALES/RH_RECRUITER ; DELETE: ADMIN/SALES).
 *
 * Couverture : garde d'auth (401/403), validation Zod (400 sur uuid/body),
 * 404-like (DELETE d'un id inexistant → Prisma P2025), et chemins heureux
 * (création 201 avec relation user, lecture triée 200).
 */
describe('Interactions — /api/clients/:clientId/interactions', () => {
  let app: Express;
  let clientId: string;
  let adminId: string;
  let adminToken: string;
  let salesToken: string;
  let rhToken: string;
  let clientToken: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.int@test.com', password: pw, firstName: 'Admin', lastName: 'Int', role: 'ADMIN', isActive: true },
    });
    const sales = await prisma.user.create({
      data: { email: 'sales.int@test.com', password: pw, firstName: 'Sales', lastName: 'Int', role: 'SALES', isActive: true },
    });
    const rh = await prisma.user.create({
      data: { email: 'rh.int@test.com', password: pw, firstName: 'Rh', lastName: 'Int', role: 'RH_RECRUITER', isActive: true },
    });
    // Un Client (entreprise) auquel rattacher les interactions (FK clientId).
    const client = await prisma.client.create({
      data: { name: 'Acme Inc', email: 'contact@acme.test' },
    });

    adminId = admin.id;
    clientId = client.id;
    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });
    rhToken = generateAccessToken({ userId: rh.id, email: rh.email!, role: rh.role });
    // Token « portail client » : la stratégie JWT résout un role CLIENT en
    // cherchant un Client par userId. On lie donc le token à l'id du Client réel
    // pour que la stratégie le valide, puis qu'authenticateStaff le rejette (403).
    clientToken = generateAccessToken({ userId: client.id, email: client.email, role: 'CLIENT' as any });
  });

  const base = () => `/api/clients/${clientId}/interactions`;

  describe('garde d\'authentification', () => {
    it('GET sans token → 401', async () => {
      const res = await request(app).get(base());
      expect(res.status).toBe(401);
    });

    it('POST avec un token CLIENT → 403 (réservé au staff)', async () => {
      const res = await request(app)
        .post(base())
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ type: 'CALL', direction: 'OUTBOUND' });
      expect(res.status).toBe(403);
    });

    it('DELETE avec un token RH_RECRUITER → 403 (réservé ADMIN/SALES)', async () => {
      const res = await request(app)
        .delete(`${base()}/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${rhToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('validation (400)', () => {
    it('POST sans type/direction → 400', async () => {
      const res = await request(app)
        .post(base())
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ subject: 'Pas de type ni direction' });
      expect(res.status).toBe(400);
    });

    it('GET avec un clientId non-uuid → 400', async () => {
      const res = await request(app)
        .get('/api/clients/not-a-uuid/interactions')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('POST / (createInteraction)', () => {
    it('ADMIN enregistre une interaction → 201 avec relation user', async () => {
      const res = await request(app)
        .post(base())
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'CALL', direction: 'OUTBOUND', subject: 'Appel de suivi', content: 'Discussion budget' });

      expect(res.status).toBe(201);
      expect(res.body.message).toMatch(/enregistr/i);
      expect(res.body.data.type).toBe('CALL');
      expect(res.body.data.direction).toBe('OUTBOUND');
      expect(res.body.data.subject).toBe('Appel de suivi');
      expect(res.body.data.clientId).toBe(clientId);
      // createdBy doit pointer sur l'utilisateur authentifié, et la relation user est incluse.
      expect(res.body.data.createdBy).toBe(adminId);
      expect(res.body.data.user.id).toBe(adminId);
      expect(res.body.data.user.firstName).toBe('Admin');
    });

    it('SALES enregistre aussi une interaction → 201', async () => {
      const res = await request(app)
        .post(base())
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ type: 'EMAIL', direction: 'INBOUND' });
      expect(res.status).toBe(201);
      expect(res.body.data.type).toBe('EMAIL');
    });
  });

  describe('GET / (getClientInteractions)', () => {
    it('ADMIN liste les interactions du client, triées par date desc', async () => {
      const res = await request(app)
        .get(base())
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      // Les deux créations précédentes (CALL puis EMAIL) doivent être présentes.
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      const types = res.body.data.map((i: any) => i.type);
      expect(types).toContain('CALL');
      expect(types).toContain('EMAIL');
      // Tri décroissant : la plus récente (EMAIL) d'abord.
      const dates = res.body.data.map((i: any) => new Date(i.createdAt).getTime());
      const sorted = [...dates].sort((a, b) => b - a);
      expect(dates).toEqual(sorted);
      // La relation user est incluse mais n'expose pas le mot de passe.
      expect(res.body.data[0].user).toBeDefined();
      expect(res.body.data[0].user.password).toBeUndefined();
    });
  });

  describe('DELETE /:id (deleteInteraction)', () => {
    it('ADMIN supprime une interaction existante → 200', async () => {
      const created = await prisma.interaction.create({
        data: { clientId, type: 'NOTE', direction: 'INBOUND', createdBy: adminId },
      });

      const res = await request(app)
        .delete(`${base()}/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/supprim/i);

      const stillThere = await prisma.interaction.findUnique({ where: { id: created.id } });
      expect(stillThere).toBeNull();
    });

    // Corrigé : deleteInteraction vérifie désormais l'existence avant le delete
    // (sinon prisma.delete levait P2025, non mappé par ApiError.fromUnknown → 500).
    it('DELETE sur un id inexistant → 404', async () => {
      const res = await request(app)
        .delete(`${base()}/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });
});
