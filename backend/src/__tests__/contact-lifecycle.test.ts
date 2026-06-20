import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Cycle de vie des contacts — /api/contacts (contact-lifecycle.controller).
 *
 * Routeur monté dans app.ts : app.use('/api/contacts', contactLifecycleRoutes),
 * protégé en bloc par `authenticateStaff` (router.use). 4 endpoints :
 *  - GET  /lookup?email=&phone=     → findContactEverywhere (3 sections)
 *  - GET  /search-count?q=          → { employees, candidates, prospects } (compteurs)
 *  - GET  /search?q=&limit=         → top-N par section (omnibox)
 *  - POST /move { fromSection, fromId, toSection } → déplace + soft-delete source
 *
 * Couvre :
 *  - la garde d'auth (`authenticateStaff`) : 401 sans token, 403 pour un token CLIENT ;
 *  - la visibilité par rôle dans le controller (CAN_SEE_RECRUITING = ADMIN/RH_RECRUITER/SALES) :
 *    MAGASIN ne voit QUE les employés dans search/search-count (candidats/prospects masqués) ;
 *  - la validation métier de /move (400 section invalide, 400 fromId manquant) ;
 *  - 404 source introuvable pour /move ;
 *  - 2 chemins heureux : recherche transversale réelle (searchText) et un déplacement
 *    prospect → employee avec assertions sur l'effet en base (création + soft-delete).
 *
 * Aucun service externe : on évite délibérément les chemins qui touchent
 * candidate-video.service / R2 (un move vers candidate AVEC vidéo). Les seeds
 * de move n'ont pas de vidéo → zéro réseau.
 */
describe('Contacts (cycle de vie) — /api/contacts', () => {
  let app: Express;

  let adminToken: string;
  let magasinToken: string;
  let clientToken: string;

  // Personnes seedées pour la recherche (« Raphaël Gagnon » + accents/téléphone).
  let employeeId: string;
  let candidateId: string;
  let prospectId: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.contact@test.com', password: pw, firstName: 'Admin', lastName: 'Staff', role: 'ADMIN', isActive: true },
    });
    // MAGASIN : staff authentifié, mais HORS de CAN_SEE_RECRUITING → ne voit que les employés.
    const magasin = await prisma.user.create({
      data: { email: 'magasin.contact@test.com', password: pw, firstName: 'Maga', lastName: 'Sin', role: 'MAGASIN', isActive: true },
    });

    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    magasinToken = generateAccessToken({ userId: magasin.id, email: magasin.email!, role: magasin.role });

    // Token CLIENT : passport le résout via la table `clients` → il faut un vrai client,
    // sinon 401 (client introuvable) au lieu du 403 attendu d'authenticateStaff.
    const clientAccount = await prisma.client.create({
      data: { name: 'Portail Client', email: 'portail.contact@client.com', password: pw, isActive: true },
    });
    clientToken = generateAccessToken({ userId: clientAccount.id, email: clientAccount.email, role: 'CLIENT' });

    // Trois homonymes « Raphaël Gagnon » dans chaque section, avec accents pour
    // exercer la normalisation accent-insensible de la colonne générée searchText.
    const employee = await prisma.employee.create({
      data: { firstName: 'Raphaël', lastName: 'Gagnon', email: 'raph.emp@test.com', phone: '5145551111', city: 'Montréal', status: 'ACTIF' },
    });
    employeeId = employee.id;

    const candidate = await prisma.candidate.create({
      data: {
        firstName: 'Raphaël', lastName: 'Gagnon', email: 'raph.cand@test.com', phone: '4385552222',
        city: 'Laval', status: 'EN_ATTENTE', createdById: admin.id,
      },
    });
    candidateId = candidate.id;

    const prospect = await prisma.prospectCandidate.create({
      data: { firstName: 'Raphaël', lastName: 'Gagnon', email: 'raph.pros@test.com', phone: '5145553333', city: 'Brossard' },
    });
    prospectId = prospect.id;
  });

  describe("garde d'authentification (authenticateStaff)", () => {
    it('GET /search sans token → 401', async () => {
      const res = await request(app).get('/api/contacts/search').query({ q: 'gagnon' });
      expect(res.status).toBe(401);
    });

    it('POST /move avec token CLIENT → 403 (back-office interdit aux comptes portail)', async () => {
      const res = await request(app)
        .post('/api/contacts/move')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ fromSection: 'prospect', fromId: prospectId, toSection: 'employee' });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /search (searchPeople)', () => {
    it('ADMIN trouve la personne dans les 3 sections (accents ignorés)', async () => {
      const res = await request(app)
        .get('/api/contacts/search')
        .query({ q: 'gagnon raphael' }) // ordre inversé + sans accent
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const { employees, candidates, prospects } = res.body.data;
      expect(employees.map((e: any) => e.id)).toContain(employeeId);
      expect(candidates.map((c: any) => c.id)).toContain(candidateId);
      expect(prospects.map((p: any) => p.id)).toContain(prospectId);
      // Forme : section taguée + pas de hash/champs sensibles (PERSON_SELECT minimal).
      expect(employees[0]).toMatchObject({ section: 'employee' });
      expect(employees[0].password).toBeUndefined();
      expect(Object.keys(employees[0]).sort()).toEqual(['email', 'firstName', 'id', 'lastName', 'section']);
    });

    it('MAGASIN ne voit QUE les employés (candidats/prospects masqués par CAN_SEE_RECRUITING)', async () => {
      const res = await request(app)
        .get('/api/contacts/search')
        .query({ q: 'gagnon' })
        .set('Authorization', `Bearer ${magasinToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.employees.map((e: any) => e.id)).toContain(employeeId);
      expect(res.body.data.candidates).toEqual([]);
      expect(res.body.data.prospects).toEqual([]);
    });

    it('requête vide → toutes sections vides (pas de filtrage = pas de fuite)', async () => {
      const res = await request(app)
        .get('/api/contacts/search')
        .query({ q: '   ' })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ employees: [], candidates: [], prospects: [] });
    });
  });

  describe('GET /search-count (searchPeopleCount)', () => {
    it('ADMIN → compte les 3 sections', async () => {
      const res = await request(app)
        .get('/api/contacts/search-count')
        .query({ q: 'gagnon' })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ employees: 1, candidates: 1, prospects: 1 });
    });

    it('MAGASIN → candidats et prospects forcés à 0 (employés seulement)', async () => {
      const res = await request(app)
        .get('/api/contacts/search-count')
        .query({ q: 'gagnon' })
        .set('Authorization', `Bearer ${magasinToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ employees: 1, candidates: 0, prospects: 0 });
    });
  });

  describe('GET /lookup (lookupContact)', () => {
    it('email d\'un employé → trouve la section employee (priorité)', async () => {
      const res = await request(app)
        .get('/api/contacts/lookup')
        .query({ email: 'raph.emp@test.com' })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ section: 'employee', id: employeeId });
    });

    it('email inconnu → data null', async () => {
      const res = await request(app)
        .get('/api/contacts/lookup')
        .query({ email: 'personne@nulle-part.com' })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });
  });

  describe('POST /move (moveContactController)', () => {
    it('section invalide → 400', async () => {
      const res = await request(app)
        .post('/api/contacts/move')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fromSection: 'wizard', fromId: prospectId, toSection: 'employee' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/section invalide/i);
    });

    it('fromId manquant → 400', async () => {
      const res = await request(app)
        .post('/api/contacts/move')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fromSection: 'prospect', toSection: 'employee' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/fromId requis/i);
    });

    it('source introuvable → 404 (propagé depuis le service)', async () => {
      const res = await request(app)
        .post('/api/contacts/move')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fromSection: 'prospect', fromId: '00000000-0000-0000-0000-000000000000', toSection: 'employee' });
      expect(res.status).toBe(404);
    });

    it('chemin heureux : prospect → employee crée la cible et soft-delete la source', async () => {
      // Source dédiée à ce test (sans vidéo → aucun appel R2/candidate-video).
      const src = await prisma.prospectCandidate.create({
        data: { firstName: 'Move', lastName: 'Me', email: 'move.me@test.com', phone: '5145559999', city: 'Longueuil' },
      });

      const res = await request(app)
        .post('/api/contacts/move')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fromSection: 'prospect', fromId: src.id, toSection: 'employee' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/déplacé vers employee/i);
      expect(res.body.data).toMatchObject({ section: 'employee', firstName: 'Move', lastName: 'Me' });

      // La cible employé existe vraiment, non supprimée.
      const newEmp = await prisma.employee.findUnique({ where: { id: res.body.data.id } });
      expect(newEmp).not.toBeNull();
      expect(newEmp?.isDeleted).toBe(false);
      expect(newEmp?.email).toBe('move.me@test.com');

      // La source prospect est soft-deletée (réversible).
      const after = await prisma.prospectCandidate.findUnique({ where: { id: src.id } });
      expect(after?.isDeleted).toBe(true);
      expect(after?.deletedAt).not.toBeNull();
    });
  });
});
