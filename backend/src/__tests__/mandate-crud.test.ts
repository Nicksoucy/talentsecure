import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

// Le géocodage appelle Nominatim : jamais de réseau en test.
jest.mock('../services/mandateGeocode.service', () => ({
  MANDATE_MAPPOINTS_CACHE_KEY: 'mandates:map-points',
  geocodeMandateById: jest.fn().mockResolvedValue(null),
  invalidateMandateCaches: jest.fn().mockResolvedValue(undefined),
}));

import { geocodeMandateById } from '../services/mandateGeocode.service';

/**
 * Ajout, retrait et retour d'un mandat depuis l'écran Mandats —
 * POST /api/mandates, DELETE /api/mandates/:id, POST /api/mandates/:id/restore.
 *
 * Le retrait est réversible (isDeleted) : un mandat retiré sort de la liste et
 * se retrouve dans la vue `removed=true`, d'où on le ramène profil compris.
 */
describe('Mandats — ajout, retrait, retour', () => {
  let app: Express;
  let adminToken: string;
  let salesToken: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');
    const admin = await prisma.user.create({
      data: {
        email: 'admin.crud@test.com', password: pw, firstName: 'Admin',
        lastName: 'Staff', role: 'ADMIN', isActive: true,
      },
    });
    const sales = await prisma.user.create({
      data: {
        email: 'sales.crud@test.com', password: pw, firstName: 'Sales',
        lastName: 'Staff', role: 'SALES', isActive: true,
      },
    });
    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });

    await prisma.mandate.create({ data: { externalId: 'GAR-000100', name: 'Site Agendrix existant' } });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  const post = (body: object, token = adminToken) =>
    request(app).post('/api/mandates').set('Authorization', `Bearer ${token}`).send(body);

  describe('ajout', () => {
    it('SALES ne peut pas ajouter → 403', async () => {
      const res = await post({ name: 'Interdit' }, salesToken);
      expect(res.status).toBe(403);
    });

    it('nom requis → 400', async () => {
      const res = await post({ name: '   ' });
      expect(res.status).toBe(400);
    });

    it('lat/lng refusés (.strict) → 400', async () => {
      const res = await post({ name: 'Site', lat: 45 });
      expect(res.status).toBe(400);
    });

    it('crée le mandat avec un identifiant MAN-0001 et lance le géocodage', async () => {
      const res = await post({
        name: 'Entrepôt Laval',
        address: '1000 boul. Saint-Martin',
        city: 'Laval',
        postalCode: 'h7s 1m5',
        clientName: 'Client X',
      });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        externalId: 'MAN-0001',
        name: 'Entrepôt Laval',
        city: 'Laval',
        postalCode: 'H7S 1M5',
        province: 'QC',
        clientName: 'Client X',
        isActive: true,
        requiresBSP: true,
      });
      expect(geocodeMandateById).toHaveBeenCalledWith(res.body.data.id);
    });

    it('les identifiants générés se suivent', async () => {
      const res = await post({ name: 'Deuxième site manuel' });
      expect(res.status).toBe(201);
      expect(res.body.data.externalId).toBe('MAN-0002');
    });

    it('identifiant Agendrix saisi et déjà pris → 409', async () => {
      const res = await post({ name: 'Doublon', externalId: 'GAR-000100' });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Site Agendrix existant/);
    });
  });

  describe('retrait et retour', () => {
    let id: string;

    beforeAll(async () => {
      const m = await prisma.mandate.create({
        data: { externalId: 'GAR-000200', name: 'Site à retirer', shiftNights: true, notes: 'garder' },
      });
      id = m.id;
    });

    it('SALES ne peut pas retirer → 403', async () => {
      const res = await request(app).delete(`/api/mandates/${id}`).set('Authorization', `Bearer ${salesToken}`);
      expect(res.status).toBe(403);
    });

    it('retire le mandat : absent de la liste, présent dans la vue des retirés', async () => {
      const res = await request(app).delete(`/api/mandates/${id}`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.isDeleted).toBe(true);

      const list = await request(app).get('/api/mandates').set('Authorization', `Bearer ${adminToken}`);
      expect(list.body.data.map((m: any) => m.id)).not.toContain(id);

      const removed = await request(app)
        .get('/api/mandates?removed=true')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(removed.body.data.map((m: any) => m.id)).toEqual([id]);

      // Rien n'est effacé en base
      expect(await prisma.mandate.findUnique({ where: { id } })).not.toBeNull();
    });

    it('retirer deux fois → 404', async () => {
      const res = await request(app).delete(`/api/mandates/${id}`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('un nouvel ajout ne peut pas reprendre l’identifiant d’un mandat retiré → 409', async () => {
      const res = await post({ name: 'Même identifiant', externalId: 'GAR-000200' });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/ramenez-le/);
    });

    it('ramène le mandat avec son profil intact', async () => {
      const res = await request(app)
        .post(`/api/mandates/${id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ isDeleted: false, deletedAt: null, shiftNights: true, notes: 'garder' });

      const list = await request(app).get('/api/mandates').set('Authorization', `Bearer ${adminToken}`);
      expect(list.body.data.map((m: any) => m.id)).toContain(id);
    });

    it('ramener un mandat qui n’est pas retiré → 404', async () => {
      const res = await request(app)
        .post(`/api/mandates/${id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });
});
