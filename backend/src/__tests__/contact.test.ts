import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Contacts — /api/clients/:clientId/contacts (contact.controller).
 *
 * Le routeur contact.routes est monté SOUS client.routes via
 * `router.use('/:clientId/contacts', contactRoutes)` avec `mergeParams: true`.
 * Toutes les routes passent par `authenticateStaff`.
 *
 * Couvre :
 *  - garde d'auth (`authenticateStaff`) : 401 sans token, 403 pour un token CLIENT (portail) ;
 *  - garde de rôle (`authorizeRoles`) : 403 pour RH_RECRUITER sur DELETE (lecture/écriture OK
 *    mais suppression réservée ADMIN/SALES) ;
 *  - validation Zod : 400 sur body incomplet (firstName/lastName requis) et :clientId non-UUID ;
 *  - 404 sur update d'un contact inexistant ;
 *  - chemins heureux : liste (primaires d'abord), création (201 + audit log),
 *    update, soft-delete (isActive=false + exclu de la liste) ;
 *  - invariant « un seul contact primaire » : créer un nouveau primaire déclasse l'ancien.
 */
describe('Contacts — /api/clients/:clientId/contacts', () => {
  let app: Express;

  let adminToken: string;
  let salesToken: string;
  let rhToken: string;
  let clientToken: string;

  let clientId: string;
  let otherClientId: string;
  let primaryContactId: string;
  let secondaryContactId: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.contact@test.com', password: pw, firstName: 'Admin', lastName: 'Staff', role: 'ADMIN', isActive: true },
    });
    const sales = await prisma.user.create({
      data: { email: 'sales.contact@test.com', password: pw, firstName: 'Sales', lastName: 'Staff', role: 'SALES', isActive: true },
    });
    // RH_RECRUITER : peut créer/modifier des contacts mais PAS supprimer (DELETE = ADMIN/SALES).
    const rh = await prisma.user.create({
      data: { email: 'rh.contact@test.com', password: pw, firstName: 'Rh', lastName: 'Recruteur', role: 'RH_RECRUITER', isActive: true },
    });

    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });
    rhToken = generateAccessToken({ userId: rh.id, email: rh.email!, role: rh.role });

    // Token portail client (role:'CLIENT') — doit être rejeté par authenticateStaff.
    const clientAccount = await prisma.client.create({
      data: { name: 'Portail Client', email: 'portail.contact@client.com', password: pw, isActive: true },
    });
    clientToken = generateAccessToken({ userId: clientAccount.id, email: clientAccount.email, role: 'CLIENT' });

    // Le client porteur des contacts de test.
    const client = await prisma.client.create({
      data: { name: 'Acme Contacts', companyName: 'Acme Inc', email: 'acme.contacts@test.com', isActive: true },
    });
    clientId = client.id;

    const otherClient = await prisma.client.create({
      data: { name: 'Autre Client', email: 'autre.contacts@test.com', isActive: true },
    });
    otherClientId = otherClient.id;

    // Un contact primaire + un secondaire pour ce client.
    const primary = await prisma.contact.create({
      data: { clientId, firstName: 'Paula', lastName: 'Primaire', email: 'paula@acme.com', isPrimary: true, isActive: true },
    });
    primaryContactId = primary.id;

    const secondary = await prisma.contact.create({
      data: { clientId, firstName: 'Sam', lastName: 'Secondaire', email: 'sam@acme.com', isPrimary: false, isActive: true },
    });
    secondaryContactId = secondary.id;
  });

  describe("garde d'authentification (authenticateStaff)", () => {
    it('sans token → 401', async () => {
      const res = await request(app).get(`/api/clients/${clientId}/contacts`);
      expect(res.status).toBe(401);
    });

    it('token CLIENT (portail) → 403', async () => {
      const res = await request(app)
        .get(`/api/clients/${clientId}/contacts`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('garde de rôle (authorizeRoles)', () => {
    it('RH_RECRUITER ne peut pas supprimer un contact → 403', async () => {
      const res = await request(app)
        .delete(`/api/clients/${clientId}/contacts/${secondaryContactId}`)
        .set('Authorization', `Bearer ${rhToken}`);
      expect(res.status).toBe(403);

      // Le contact ne doit PAS avoir été désactivé.
      const after = await prisma.contact.findUnique({ where: { id: secondaryContactId } });
      expect(after?.isActive).toBe(true);
    });
  });

  describe('validation (Zod)', () => {
    it('création sans firstName/lastName → 400', async () => {
      const res = await request(app)
        .post(`/api/clients/${clientId}/contacts`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ email: 'incomplet@acme.com' });
      expect(res.status).toBe(400);
    });

    it(':clientId non-UUID → 400 (validation params)', async () => {
      const res = await request(app)
        .get('/api/clients/pas-un-uuid/contacts')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('GET / (getClientContacts)', () => {
    it('staff authentifié → liste avec contacts primaires en tête', async () => {
      const res = await request(app)
        .get(`/api/clients/${clientId}/contacts`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);
      // orderBy isPrimary desc → le primaire est premier.
      expect(res.body.data[0].isPrimary).toBe(true);
      expect(res.body.data[0].id).toBe(primaryContactId);
    });
  });

  describe('POST / (createContact)', () => {
    it('SALES crée un contact → 201 + audit log écrit', async () => {
      const res = await request(app)
        .post(`/api/clients/${clientId}/contacts`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ firstName: 'Nouveau', lastName: 'Contact', role: 'DRH', email: 'nouveau@acme.com' });
      expect(res.status).toBe(201);
      expect(res.body.data.firstName).toBe('Nouveau');
      expect(res.body.data.clientId).toBe(clientId);
      expect(res.body.data.isPrimary).toBe(false);

      const log = await prisma.auditLog.findFirst({
        where: { resource: 'Contact', resourceId: res.body.data.id, action: 'CREATE' },
      });
      expect(log).not.toBeNull();
    });

    it('nouveau contact primaire → déclasse l\'ancien primaire (un seul primaire)', async () => {
      const res = await request(app)
        .post(`/api/clients/${clientId}/contacts`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'Nina', lastName: 'NouvellePrimaire', isPrimary: true });
      expect(res.status).toBe(201);
      expect(res.body.data.isPrimary).toBe(true);

      // L'ancien primaire doit avoir été déclassé.
      const oldPrimary = await prisma.contact.findUnique({ where: { id: primaryContactId } });
      expect(oldPrimary?.isPrimary).toBe(false);

      // Il ne reste qu'un seul primaire actif pour ce client.
      const primaries = await prisma.contact.count({ where: { clientId, isPrimary: true } });
      expect(primaries).toBe(1);
    });
  });

  describe('PUT /:id (updateContact)', () => {
    it('contact inexistant → 404', async () => {
      const res = await request(app)
        .put(`/api/clients/${clientId}/contacts/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'Directeur' });
      expect(res.status).toBe(404);
    });

    it('mise à jour valide → 200 et champ modifié en base', async () => {
      const res = await request(app)
        .put(`/api/clients/${clientId}/contacts/${secondaryContactId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ role: 'Comptable', phone: '5145559999' });
      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('Comptable');

      const after = await prisma.contact.findUnique({ where: { id: secondaryContactId } });
      expect(after?.phone).toBe('5145559999');
    });
  });

  describe('DELETE /:id (deleteContact — soft delete)', () => {
    it('ADMIN désactive un contact → 200, isActive=false et exclu de la liste', async () => {
      const toDelete = await prisma.contact.create({
        data: { clientId, firstName: 'A', lastName: 'Supprimer', isActive: true },
      });

      const res = await request(app)
        .delete(`/api/clients/${clientId}/contacts/${toDelete.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const after = await prisma.contact.findUnique({ where: { id: toDelete.id } });
      expect(after?.isActive).toBe(false);

      // Le soft-delete doit l'exclure de getClientContacts (where isActive:true).
      const list = await request(app)
        .get(`/api/clients/${clientId}/contacts`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(list.body.data.some((c: any) => c.id === toDelete.id)).toBe(false);
    });

    it('DELETE avec :id appartenant à un AUTRE client → 404 (pas de fuite inter-client)', async () => {
      // Contact réel mais rattaché à otherClientId ; on tente de le supprimer via clientId.
      const foreign = await prisma.contact.create({
        data: { clientId: otherClientId, firstName: 'Etranger', lastName: 'Contact', isActive: true },
      });

      const res = await request(app)
        .delete(`/api/clients/${clientId}/contacts/${foreign.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);

      // Le contact de l'autre client reste actif.
      const after = await prisma.contact.findUnique({ where: { id: foreign.id } });
      expect(after?.isActive).toBe(true);
    });
  });
});
