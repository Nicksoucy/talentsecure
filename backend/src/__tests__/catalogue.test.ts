import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

// Services externes : le controller catalogue importe R2 + PDF au chargement du
// module. Aucun des endpoints testés ici (CRUD + lien de partage + vue publique)
// ne génère de PDF ni ne touche R2, mais on neutralise quand même ces modules
// pour garantir zéro réseau réel si jamais le code de chargement évoluait.
jest.mock('../services/r2.service', () => ({
  useR2: false,
  getSignedFileUrl: jest.fn(),
}));
jest.mock('../services/pdf.service', () => ({
  PDFService: {
    generateCataloguePDF: jest.fn(),
    mergeCVs: jest.fn(),
  },
}));

/**
 * Catalogues — /api/catalogues
 *
 * Couvre :
 *  - la garde d'auth (`authenticateStaff`) : 401 sans token, 403 pour un token CLIENT
 *    (signé sur un vrai prisma.client, sinon passport renvoie 401) ;
 *  - la garde de rôle (`authorizeRoles`) : 403 MAGASIN sur create (ADMIN/SALES/RH only)
 *    et sur delete (ADMIN only) ;
 *  - la validation des paramètres (`uuidParam`) : 400 sur un :id non-UUID ;
 *  - les erreurs métier : 400 champs requis manquants, 404 client/catalogue introuvable ;
 *  - chemins heureux : création (201) avec items + audit log, liste (200), détail (200) ;
 *  - lien de partage (200) puis vue publique par token (200) avec l'invariant de
 *    confidentialité C1/S2 (CV, téléphone, notes RH masqués) ;
 *  - le refus 409 de suppression d'un catalogue payé (garde D2).
 */
describe('Catalogues — /api/catalogues', () => {
  let app: Express;

  let adminToken: string;
  let salesToken: string;
  let magasinToken: string;
  let clientToken: string;

  let adminUserId: string;
  let clientId: string;
  let candidateId: string;
  let catalogueId: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.cat@test.com', password: pw, firstName: 'Admin', lastName: 'Staff', role: 'ADMIN', isActive: true },
    });
    adminUserId = admin.id;
    const sales = await prisma.user.create({
      data: { email: 'sales.cat@test.com', password: pw, firstName: 'Sales', lastName: 'Staff', role: 'SALES', isActive: true },
    });
    // MAGASIN : staff authentifié mais hors des authorizeRoles de create/delete.
    const magasin = await prisma.user.create({
      data: { email: 'magasin.cat@test.com', password: pw, firstName: 'Maga', lastName: 'Sin', role: 'MAGASIN', isActive: true },
    });

    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });
    magasinToken = generateAccessToken({ userId: magasin.id, email: magasin.email!, role: magasin.role });

    // Piège connu : un token role:'CLIENT' est résolu par passport via la table
    // `clients`. Il faut donc un vrai prisma.client, sinon passport → 401 (et on
    // veut tester le 403 de authenticateStaff, pas le 401).
    const clientAccount = await prisma.client.create({
      data: { name: 'Portail Client', email: 'portail.cat@client.com', password: pw, isActive: true },
    });
    clientToken = generateAccessToken({ userId: clientAccount.id, email: clientAccount.email, role: 'CLIENT' });

    // Client cible des catalogues (FK clientId requise).
    const client = await prisma.client.create({
      data: { name: 'Acme Catalogue', companyName: 'Acme Inc', email: 'acme.cat@client.com', province: 'QC', isActive: true },
    });
    clientId = client.id;

    // Candidat (firstName/lastName/phone/city requis) pour peupler un item.
    const candidate = await prisma.candidate.create({
      data: {
        firstName: 'Jean',
        lastName: 'Tremblay',
        phone: '5145559999',
        city: 'Montréal',
        cvUrl: 'https://example.com/cv.pdf',
        hrNotes: 'Notes RH internes confidentielles',
        status: 'QUALIFIE',
        createdById: admin.id,
      },
    });
    candidateId = candidate.id;

    // Catalogue existant pour les lectures / partage / suppression.
    const cat = await prisma.catalogue.create({
      data: {
        clientId,
        title: 'Catalogue existant',
        createdById: admin.id,
        items: { create: [{ candidateId, order: 0 }] },
      },
    });
    catalogueId = cat.id;
  });

  describe("garde d'authentification (authenticateStaff)", () => {
    it('sans token → 401', async () => {
      const res = await request(app).get('/api/catalogues');
      expect(res.status).toBe(401);
    });

    it('token CLIENT → 403 (back-office interdit aux comptes portail)', async () => {
      const res = await request(app)
        .get('/api/catalogues')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('garde de rôle (authorizeRoles)', () => {
    it('MAGASIN ne peut pas créer → 403', async () => {
      const res = await request(app)
        .post('/api/catalogues')
        .set('Authorization', `Bearer ${magasinToken}`)
        .send({ clientId, title: 'Refusé' });
      expect(res.status).toBe(403);
    });

    it('MAGASIN ne peut pas supprimer → 403 (delete réservé ADMIN)', async () => {
      const res = await request(app)
        .delete(`/api/catalogues/${catalogueId}`)
        .set('Authorization', `Bearer ${magasinToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET / (getCatalogues)', () => {
    it('staff authentifié → liste paginée incluant le catalogue seedé', async () => {
      const res = await request(app)
        .get('/api/catalogues')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toMatchObject({ page: 1, limit: 20 });
      const ids = res.body.data.map((c: any) => c.id);
      expect(ids).toContain(catalogueId);
    });

    it('filtre clientId → ne renvoie que les catalogues de ce client', async () => {
      const res = await request(app)
        .get('/api/catalogues')
        .query({ clientId })
        .set('Authorization', `Bearer ${salesToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.every((c: any) => c.clientId === clientId)).toBe(true);
    });
  });

  describe('GET /:id (getCatalogueById)', () => {
    it('id valide existant → détail avec items ordonnés', async () => {
      const res = await request(app)
        .get(`/api/catalogues/${catalogueId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(catalogueId);
      expect(res.body.client.id).toBe(clientId);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items[0].candidate.id).toBe(candidateId);
    });

    it('id non-UUID → 400 (validation params)', async () => {
      const res = await request(app)
        .get('/api/catalogues/pas-un-uuid')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });

    it('UUID inexistant → 404', async () => {
      const res = await request(app)
        .get('/api/catalogues/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST / (createCatalogue)', () => {
    it('champs requis manquants (pas de title) → 400', async () => {
      const res = await request(app)
        .post('/api/catalogues')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ clientId });
      expect(res.status).toBe(400);
      // Validation au bord (P2-A) : enveloppe ERREUR_VALIDATION, le champ manquant
      // (title) est listé dans `details` (message Zod = « Required » quand absent).
      expect(res.body.code).toBe('ERREUR_VALIDATION');
      expect(res.body.details.some((d: any) => d.field === 'title')).toBe(true);
    });

    it('clientId inexistant → 404', async () => {
      const res = await request(app)
        .post('/api/catalogues')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ clientId: '00000000-0000-0000-0000-000000000000', title: 'Orphelin' });
      expect(res.status).toBe(404);
    });

    it('SALES crée un catalogue avec items → 201 + audit log', async () => {
      const res = await request(app)
        .post('/api/catalogues')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ clientId, title: 'Nouveau Catalogue', candidateIds: [candidateId] });
      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Nouveau Catalogue');
      expect(res.body.clientId).toBe(clientId);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].candidateId).toBe(candidateId);

      const log = await prisma.auditLog.findFirst({
        where: { resource: 'Catalogue', resourceId: res.body.id, action: 'CREATE' },
      });
      expect(log).not.toBeNull();
    });
  });

  describe('POST /:id/share + GET /view/:token (partage public)', () => {
    it('génère un lien puis le rend lisible publiquement avec champs confidentiels masqués', async () => {
      const shareRes = await request(app)
        .post(`/api/catalogues/${catalogueId}/share`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ expirationDays: 30 });
      expect(shareRes.status).toBe(200);
      expect(typeof shareRes.body.shareToken).toBe('string');
      expect(shareRes.body.shareToken.length).toBeGreaterThan(0);

      // Vue PUBLIQUE — aucun header d'auth.
      const token = shareRes.body.shareToken;
      const viewRes = await request(app).get(`/api/catalogues/view/${token}`);
      expect(viewRes.status).toBe(200);
      expect(viewRes.body.id).toBe(catalogueId);
      expect(Array.isArray(viewRes.body.items)).toBe(true);

      // Invariant confidentialité C1/S2 : jamais de CV / téléphone / notes RH
      // exposés sur un lien public.
      const cand = viewRes.body.items[0].candidate;
      expect(cand.phone).toBeNull();
      expect(cand.cvUrl).toBeNull();
      expect(cand.hrNotes).toBeNull();
    });

    it('token de partage inconnu → 404', async () => {
      const res = await request(app).get('/api/catalogues/view/token-inexistant-xyz');
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:id (deleteCatalogue)', () => {
    it('refuse 409 la suppression d\'un catalogue payé (garde D2)', async () => {
      const paid = await prisma.catalogue.create({
        data: { clientId, title: 'Catalogue payé', createdById: adminUserId, isPaid: true },
      });
      const res = await request(app)
        .delete(`/api/catalogues/${paid.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(409);

      // Toujours présent en base : suppression bien refusée.
      const still = await prisma.catalogue.findUnique({ where: { id: paid.id } });
      expect(still).not.toBeNull();
    });

    it('ADMIN supprime un catalogue non payé → 200 et disparu de la base', async () => {
      const toDelete = await prisma.catalogue.create({
        data: { clientId, title: 'A Supprimer', createdById: adminUserId },
      });
      const res = await request(app)
        .delete(`/api/catalogues/${toDelete.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const after = await prisma.catalogue.findUnique({ where: { id: toDelete.id } });
      expect(after).toBeNull();
    });
  });
});
