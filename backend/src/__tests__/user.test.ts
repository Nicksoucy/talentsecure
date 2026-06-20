import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Gestion des comptes (ADMIN only) — /api/users.
 * Couvre la garde de rôle (401/403), la sélection sûre (jamais le mot de passe),
 * l'exclusion des comptes CLIENT, la validation de création, et surtout
 * l'invariant métier « il doit rester au moins un administrateur actif »
 * (impossible de retirer ses propres droits admin).
 */
describe('Users — /api/users (ADMIN)', () => {
  let app: Express;
  let adminId: string;
  let adminToken: string;
  let salesToken: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.user@test.com', password: pw, firstName: 'Admin', lastName: 'User', role: 'ADMIN', isActive: true },
    });
    const sales = await prisma.user.create({
      data: { email: 'sales.user@test.com', password: pw, firstName: 'Sales', lastName: 'User', role: 'SALES', isActive: true },
    });
    // Un compte CLIENT, qui NE doit PAS apparaître dans la liste du back-office.
    await prisma.user.create({
      data: { email: 'client.user@test.com', password: pw, firstName: 'Client', lastName: 'User', role: 'CLIENT', isActive: true },
    });
    adminId = admin.id;
    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });
  });

  describe('garde de rôle', () => {
    it('sans token → 401', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(401);
    });

    it('token SALES → 403 (réservé ADMIN)', async () => {
      const res = await request(app).get('/api/users').set('Authorization', `Bearer ${salesToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET / (listUsers)', () => {
    it('ADMIN → liste le staff, exclut les CLIENT, sans mot de passe', async () => {
      const res = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const emails = res.body.data.map((u: any) => u.email);
      expect(emails).toContain('admin.user@test.com');
      expect(emails).toContain('sales.user@test.com');
      expect(emails).not.toContain('client.user@test.com');
      expect(res.body.data.every((u: any) => u.password === undefined)).toBe(true);
    });
  });

  describe('POST / (createUser)', () => {
    it('ADMIN crée un compte → 201', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'nouveau@test.com', password: 'Test1234', firstName: 'Nou', lastName: 'Veau', role: 'RH_RECRUITER' });
      expect(res.status).toBe(201);
      expect(res.body.data.email).toBe('nouveau@test.com');
      expect(res.body.data.password).toBeUndefined();
    });

    it('email déjà utilisé → 400', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'admin.user@test.com', password: 'Test1234', firstName: 'Dup', lastName: 'Lique', role: 'SALES' });
      expect(res.status).toBe(400);
    });

    it('mot de passe faible → 400 (validation)', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'faible@test.com', password: 'faible', firstName: 'Fai', lastName: 'Ble', role: 'SALES' });
      expect(res.status).toBe(400);
    });

    it('rôle invalide → 400 (validation)', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'role@test.com', password: 'Test1234', firstName: 'Ro', lastName: 'Le', role: 'SUPERGOD' });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /:id (updateUser) — invariant dernier admin', () => {
    it('un admin ne peut pas retirer ses propres droits → 400', async () => {
      const res = await request(app)
        .patch(`/api/users/${adminId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'SALES' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/administrateur|droits/i);
    });

    it('404 sur un id inexistant', async () => {
      const res = await request(app)
        .patch('/api/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'Xxx' });
      expect(res.status).toBe(404);
    });
  });
});
