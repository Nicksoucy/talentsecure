import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Clients — /api/clients (back-office + inscription publique).
 *
 * Couvre :
 *  - la garde d'auth (`authenticateStaff`) : 401 sans token, 403 pour un token CLIENT ;
 *  - la garde de rôle (`authorizeRoles`) : 403 pour un rôle staff non autorisé
 *    (ex. MAGASIN ne peut ni créer ni supprimer) ;
 *  - la validation des paramètres (`uuidParam`) : 400 sur un :id non-UUID ;
 *  - les codes d'erreur métier : 404 client introuvable, 400 email déjà pris ;
 *  - des chemins heureux (liste, détail, création, soft-delete) avec assertions
 *    réelles sur la forme de la réponse, dont l'invariant S2 « jamais le hash de
 *    mot de passe dans la réponse » ;
 *  - l'endpoint public `POST /register` (champs requis + email dupliqué).
 */
describe('Clients — /api/clients', () => {
  let app: Express;

  let adminToken: string;
  let salesToken: string;
  let magasinToken: string;
  let clientToken: string;

  let existingClientId: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.client@test.com', password: pw, firstName: 'Admin', lastName: 'Staff', role: 'ADMIN', isActive: true },
    });
    const sales = await prisma.user.create({
      data: { email: 'sales.client@test.com', password: pw, firstName: 'Sales', lastName: 'Staff', role: 'SALES', isActive: true },
    });
    // MAGASIN : staff authentifié MAIS hors de la liste autorizeRoles de create/delete.
    const magasin = await prisma.user.create({
      data: { email: 'magasin.client@test.com', password: pw, firstName: 'Maga', lastName: 'Sin', role: 'MAGASIN', isActive: true },
    });

    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });
    magasinToken = generateAccessToken({ userId: magasin.id, email: magasin.email!, role: magasin.role });

    // Un client auto-inscrit (token role:'CLIENT') doit être rejeté par authenticateStaff.
    const clientAccount = await prisma.client.create({
      data: {
        name: 'Portail Client',
        email: 'portail@client.com',
        password: pw,
        isActive: true,
      },
    });
    clientToken = generateAccessToken({ userId: clientAccount.id, email: clientAccount.email, role: 'CLIENT' });

    // Un client existant en base, avec hash de mot de passe, pour tester le strip S2.
    const seeded = await prisma.client.create({
      data: {
        name: 'Acme Existante',
        companyName: 'Acme Inc',
        email: 'acme@existante.com',
        password: pw,
        province: 'QC',
        isActive: true,
      },
    });
    existingClientId = seeded.id;
  });

  describe("garde d'authentification (authenticateStaff)", () => {
    it('sans token → 401', async () => {
      const res = await request(app).get('/api/clients');
      expect(res.status).toBe(401);
    });

    it('token CLIENT → 403 (back-office interdit aux comptes portail)', async () => {
      const res = await request(app)
        .get('/api/clients')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('garde de rôle (authorizeRoles)', () => {
    it('MAGASIN ne peut pas créer → 403', async () => {
      const res = await request(app)
        .post('/api/clients')
        .set('Authorization', `Bearer ${magasinToken}`)
        .send({ name: 'Refusé', email: 'refuse@magasin.com' });
      expect(res.status).toBe(403);
    });

    it('MAGASIN ne peut pas supprimer → 403', async () => {
      const res = await request(app)
        .delete(`/api/clients/${existingClientId}`)
        .set('Authorization', `Bearer ${magasinToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET / (getClients)', () => {
    it('staff authentifié → liste paginée sans mot de passe', async () => {
      const res = await request(app)
        .get('/api/clients')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toMatchObject({ page: 1, limit: 20 });
      const emails = res.body.data.map((c: any) => c.email);
      expect(emails).toContain('acme@existante.com');
      // S2 — aucun hash de mot de passe ne doit transiter.
      expect(res.body.data.every((c: any) => c.password === undefined)).toBe(true);
    });

    it('filtre search → ne renvoie que les correspondances', async () => {
      const res = await request(app)
        .get('/api/clients')
        .query({ search: 'Acme' })
        .set('Authorization', `Bearer ${salesToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.every((c: any) => /acme/i.test(`${c.name} ${c.companyName} ${c.email}`))).toBe(true);
    });
  });

  describe('GET /:id (getClientById)', () => {
    it('id valide existant → détail sans mot de passe', async () => {
      const res = await request(app)
        .get(`/api/clients/${existingClientId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(existingClientId);
      expect(res.body.data.email).toBe('acme@existante.com');
      expect(res.body.data.password).toBeUndefined();
    });

    it('id non-UUID → 400 (validation params)', async () => {
      const res = await request(app)
        .get('/api/clients/pas-un-uuid')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });

    it('UUID inexistant → 404', async () => {
      const res = await request(app)
        .get('/api/clients/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST / (createClient)', () => {
    it('SALES crée un client → 201 + province par défaut QC', async () => {
      const res = await request(app)
        .post('/api/clients')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ name: 'Nouveau Client', companyName: 'NewCo', email: 'nouveau@client.com', phone: '5145551234' });
      expect(res.status).toBe(201);
      expect(res.body.data.email).toBe('nouveau@client.com');
      expect(res.body.data.province).toBe('QC');
      expect(res.body.data.password).toBeUndefined();

      // L'audit log doit avoir été écrit.
      const log = await prisma.auditLog.findFirst({
        where: { resource: 'Client', resourceId: res.body.data.id, action: 'CREATE' },
      });
      expect(log).not.toBeNull();
    });

    it('email déjà existant → 400', async () => {
      const res = await request(app)
        .post('/api/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Doublon', email: 'acme@existante.com' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/existe déjà/i);
    });
  });

  describe('DELETE /:id (deleteClient — soft delete)', () => {
    it('ADMIN désactive un client → 200 et isActive=false en base', async () => {
      const toDelete = await prisma.client.create({
        data: { name: 'A Supprimer', email: 'asupprimer@client.com', isActive: true },
      });
      const res = await request(app)
        .delete(`/api/clients/${toDelete.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const after = await prisma.client.findUnique({ where: { id: toDelete.id } });
      expect(after?.isActive).toBe(false);
    });
  });

  describe('POST /register (public)', () => {
    it('champs requis manquants → 400', async () => {
      const res = await request(app)
        .post('/api/clients/register')
        .send({ email: 'incomplet@client.com' });
      expect(res.status).toBe(400);
    });

    it('inscription valide → 201 et email normalisé en minuscules, sans mot de passe', async () => {
      const res = await request(app)
        .post('/api/clients/register')
        .send({ name: 'Self Signup', email: 'SignUp@Client.COM', password: 'Test1234', companyName: 'SignCo' });
      expect(res.status).toBe(201);
      expect(res.body.data.email).toBe('signup@client.com');
      expect(res.body.data.password).toBeUndefined();
    });

    it('email déjà enregistré → 400', async () => {
      const res = await request(app)
        .post('/api/clients/register')
        .send({ name: 'Doublon', email: 'acme@existante.com', password: 'Test1234' });
      expect(res.status).toBe(400);
    });
  });
});
