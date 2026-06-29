import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Prospects — /api/prospects (back-office, monté sous authenticateStaff).
 *
 * Services externes neutralisés (zéro réseau réel) :
 *  - cityGeocode.service : géocodage à la création / mise à jour (réseau Nominatim) ;
 *  - candidateMatch : la détection de doublon (findContactEverywhere) reste réelle
 *    car elle ne fait que des requêtes Prisma (testable honnêtement), donc PAS mockée.
 *
 * Couvre :
 *  - garde d'auth (authenticateStaff) : 401 sans token, 403 pour un token CLIENT
 *    (signé sur un vrai prisma.client, sinon passport renvoie 401) ;
 *  - garde de rôle (authorizeRoles) : 403 SALES sur create (ADMIN/RH only),
 *    403 RH sur delete (ADMIN only) ;
 *  - validation : 400 sur :id non-UUID, 400 sur paramètre de query inconnu (.strict()) ;
 *  - 404 : prospect introuvable (getById, convert) ;
 *  - erreurs métier : 409 doublon à la création, 400 prospectIds manquant (bulk-assign) ;
 *  - chemins heureux : liste paginée (filtre isConverted exclu par défaut),
 *    création 201, stats summary, mark-as-contacted (effet réel en base).
 */

// Géocodage : neutralisé pour éviter tout appel réseau à la création / update.
jest.mock('../services/cityGeocode.service', () => ({
  resolveProspectCoordinates: jest.fn().mockResolvedValue(null),
  resolveCityCoordinates: jest.fn().mockResolvedValue(new Map()),
}));

describe('Prospects — /api/prospects', () => {
  let app: Express;

  let adminToken: string;
  let rhToken: string;
  let salesToken: string;
  let clientToken: string;

  let prospectId: string; // prospect actif, non converti
  let convertedProspectId: string; // prospect déjà converti
  let seededClientId: string; // client réel pour bulk-assign

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.prospect@test.com', password: pw, firstName: 'Admin', lastName: 'Staff', role: 'ADMIN', isActive: true },
    });
    const rh = await prisma.user.create({
      data: { email: 'rh.prospect@test.com', password: pw, firstName: 'RH', lastName: 'Staff', role: 'RH_RECRUITER', isActive: true },
    });
    // SALES : staff authentifié MAIS hors de la liste authorizeRoles de create/convert/contact.
    const sales = await prisma.user.create({
      data: { email: 'sales.prospect@test.com', password: pw, firstName: 'Sales', lastName: 'Staff', role: 'SALES', isActive: true },
    });

    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    rhToken = generateAccessToken({ userId: rh.id, email: rh.email!, role: rh.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });

    // Token portail CLIENT : signé sur un VRAI prisma.client (sinon passport → 401).
    const clientAccount = await prisma.client.create({
      data: { name: 'Portail Client', email: 'portail.prospect@client.com', password: pw, isActive: true },
    });
    clientToken = generateAccessToken({ userId: clientAccount.id, email: clientAccount.email, role: 'CLIENT' });

    // Client réel utilisé par bulk-assign-to-client (happy path / 404).
    const seededClient = await prisma.client.create({
      data: { name: 'Acme Recrute', email: 'acme.prospect@client.com', isActive: true },
    });
    seededClientId = seededClient.id;

    // Prospect actif (non supprimé, non converti).
    const active = await prisma.prospectCandidate.create({
      data: {
        firstName: 'Jean', lastName: 'Tremblay', email: 'jean.tremblay@prospect.com',
        phone: '5145551111', city: 'Montréal', isContacted: false, isConverted: false, isDeleted: false,
      },
    });
    prospectId = active.id;

    // Prospect déjà converti → exclu de la liste par défaut + 400 sur /convert.
    const converted = await prisma.prospectCandidate.create({
      data: {
        firstName: 'Marie', lastName: 'Gagnon', email: 'marie.gagnon@prospect.com',
        phone: '5145552222', city: 'Laval', isConverted: true, isDeleted: false,
      },
    });
    convertedProspectId = converted.id;
  });

  describe("garde d'authentification (authenticateStaff)", () => {
    it('sans token → 401', async () => {
      const res = await request(app).get('/api/prospects');
      expect(res.status).toBe(401);
    });

    it('token CLIENT → 403 (back-office interdit aux comptes portail)', async () => {
      const res = await request(app)
        .get('/api/prospects')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('garde de rôle (authorizeRoles)', () => {
    it('SALES ne peut pas créer un prospect → 403 (ADMIN/RH_RECRUITER only)', async () => {
      const res = await request(app)
        .post('/api/prospects')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ firstName: 'Refus', lastName: 'Sales', phone: '5145559999' });
      expect(res.status).toBe(403);
    });

    it('RH_RECRUITER ne peut pas supprimer → 403 (ADMIN only)', async () => {
      const res = await request(app)
        .delete(`/api/prospects/${prospectId}`)
        .set('Authorization', `Bearer ${rhToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('validation', () => {
    it('GET /:id avec un id non-UUID → 400', async () => {
      const res = await request(app)
        .get('/api/prospects/pas-un-uuid')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });

    it('GET / avec un paramètre de query inconnu → 400 (.strict())', async () => {
      const res = await request(app)
        .get('/api/prospects')
        .query({ champInconnu: 'x' })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('404 (ressource introuvable)', () => {
    it('GET /:id UUID inexistant → 404', async () => {
      const res = await request(app)
        .get('/api/prospects/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('POST /:id/convert sur un prospect inexistant → 404', async () => {
      const res = await request(app)
        .post('/api/prospects/00000000-0000-0000-0000-000000000000/convert')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(404);
    });
  });

  describe('erreurs métier', () => {
    it('POST /:id/convert sur un prospect DÉJÀ converti → 400', async () => {
      const res = await request(app)
        .post(`/api/prospects/${convertedProspectId}/convert`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/déjà été converti/i);
    });

    it('POST / avec email d\'un prospect existant → 409 (détection de doublon)', async () => {
      const res = await request(app)
        .post('/api/prospects')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ firstName: 'Doublon', lastName: 'Jean', email: 'jean.tremblay@prospect.com', phone: '5145558888' });
      expect(res.status).toBe(409);
      expect(res.body.conflict).toBeDefined();
      expect(res.body.conflict.section).toBe('prospect');
    });

    it('POST /bulk-assign-to-client sans prospectIds → 400', async () => {
      const res = await request(app)
        .post('/api/prospects/bulk-assign-to-client')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ clientId: seededClientId });
      expect(res.status).toBe(400);
      // Validation au bord (P2-A) : enveloppe ERREUR_VALIDATION, champ `prospectIds` dans `details`.
      expect(res.body.code).toBe('ERREUR_VALIDATION');
      expect(res.body.details.some((d: any) => d.field === 'prospectIds')).toBe(true);
    });

    it('POST /bulk-assign-to-client vers un client inexistant → 404', async () => {
      const res = await request(app)
        .post('/api/prospects/bulk-assign-to-client')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ prospectIds: [prospectId], clientId: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/client introuvable/i);
    });
  });

  describe('chemins heureux', () => {
    it('GET / → liste paginée, exclut les prospects convertis par défaut', async () => {
      const res = await request(app)
        .get('/api/prospects')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toMatchObject({ page: 1, limit: 10 });

      const ids = res.body.data.map((p: any) => p.id);
      expect(ids).toContain(prospectId); // le prospect actif est listé
      expect(ids).not.toContain(convertedProspectId); // le converti est exclu
    });

    it('GET /:id existant → détail du prospect', async () => {
      const res = await request(app)
        .get(`/api/prospects/${prospectId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(prospectId);
      expect(res.body.data.email).toBe('jean.tremblay@prospect.com');
    });

    it('POST / (RH, contact neuf) → 201 et prospect créé en base', async () => {
      const res = await request(app)
        .post('/api/prospects')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ firstName: 'Nouveau', lastName: 'Prospect', email: 'nouveau@prospect.com', phone: '5145557777', city: 'Québec' });
      expect(res.status).toBe(201);
      expect(res.body.data.email).toBe('nouveau@prospect.com');
      expect(res.body.data.source).toBe('manual');

      const inDb = await prisma.prospectCandidate.findUnique({ where: { id: res.body.data.id } });
      expect(inDb).not.toBeNull();
      expect(inDb?.firstName).toBe('Nouveau');
    });

    it('POST /:id/contact (RH) → 200 et isContacted=true en base', async () => {
      const fresh = await prisma.prospectCandidate.create({
        data: { firstName: 'Acont', lastName: 'Acter', phone: '5145556666', isContacted: false },
      });
      const res = await request(app)
        .post(`/api/prospects/${fresh.id}/contact`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ notes: 'Appelé le matin' });
      expect(res.status).toBe(200);
      expect(res.body.data.isContacted).toBe(true);

      const after = await prisma.prospectCandidate.findUnique({ where: { id: fresh.id } });
      expect(after?.isContacted).toBe(true);
      expect(after?.contactedAt).not.toBeNull();
    });

    it('GET /stats/summary → agrégats cohérents (total/contacted/converted)', async () => {
      const res = await request(app)
        .get('/api/prospects/stats/summary')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        total: expect.any(Number),
        contacted: expect.any(Number),
        pending: expect.any(Number),
        converted: expect.any(Number),
      });
      // Au moins le prospect converti seedé est comptabilisé.
      expect(res.body.data.converted).toBeGreaterThanOrEqual(1);
    });
  });
});
