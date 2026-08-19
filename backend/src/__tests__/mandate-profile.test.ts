import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Profil de mandat et jumelage — src/routes/mandate.routes.ts.
 *
 * Le routeur applique `authenticateJWT` puis
 * `authorizeReadWrite([ADMIN, RH, SALES, MAGASIN, MAGASIN_GESTION], [ADMIN, RH])`
 * : la lecture est large, l'écriture du profil est réservée à ADMIN/RH. SALES
 * lit donc, mais ne doit pas pouvoir coter un mandat.
 *
 * Couvre :
 *  - auth et rôles (401, 403 en écriture pour SALES) ;
 *  - validation `.strict()` — un champ inconnu est refusé (anti affectation de masse),
 *    et `lat` ne doit PAS être modifiable par ce chemin (propriété de l'import) ;
 *  - 404 sur mandat inexistant ;
 *  - liste + filtre `unratedOnly` ;
 *  - PATCH : normalisation des langues, horodatage du profil ;
 *  - jumelage : classement par distance, blocages nommés, `meta.excludedBy`.
 */

const MTL = { lat: 45.5019, lng: -73.5674 };

describe('Mandats — profil et jumelage', () => {
  let app: Express;
  let adminToken: string;
  let salesToken: string;

  let mandateId: string; // mandat de nuit, BSP requis, géocodé
  let unratedMandateId: string; // jamais coté → filtre unratedOnly

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: {
        email: 'admin.mandat@test.com', password: pw, firstName: 'Admin',
        lastName: 'Staff', role: 'ADMIN', isActive: true,
      },
    });
    const sales = await prisma.user.create({
      data: {
        email: 'sales.mandat@test.com', password: pw, firstName: 'Sales',
        lastName: 'Staff', role: 'SALES', isActive: true,
      },
    });
    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });

    const mandate = await prisma.mandate.create({
      data: {
        externalId: 'GAR-000001',
        name: 'Tour Montréal — poste de nuit',
        address: '1 Place Ville Marie',
        city: 'Montréal',
        lat: MTL.lat,
        lng: MTL.lng,
        geocodeSource: 'address',
        requiresBSP: true,
        shiftNights: true,
        profileUpdatedAt: new Date('2026-08-01T00:00:00Z'),
      },
    });
    mandateId = mandate.id;

    const unrated = await prisma.mandate.create({
      data: { externalId: 'S00999', name: 'Site jamais coté', city: 'Laval' },
    });
    unratedMandateId = unrated.id;

    // ── Candidats ────────────────────────────────────────────────────────────
    // Proche + BSP + nuit → doit sortir premier.
    await prisma.candidate.create({
      data: {
        firstName: 'Proche', lastName: 'Nuit', phone: '5145550001', city: 'Montréal', createdById: admin.id,
        hasBSP: true, bspExpiryDate: new Date('2028-01-01T00:00:00Z'),
        availableNights: true, lat: 45.5119, lng: -73.5674, geocodeSource: 'postal',
      },
    });
    // Loin mais valide → doit sortir après le proche.
    await prisma.candidate.create({
      data: {
        firstName: 'Loin', lastName: 'Nuit', phone: '5145550002', city: 'Saint-Jérôme', createdById: admin.id,
        hasBSP: true, bspExpiryDate: new Date('2028-01-01T00:00:00Z'),
        availableNights: true, lat: 45.7800, lng: -74.0000, geocodeSource: 'postal',
      },
    });
    // Sans BSP → exclu, et compté dans excludedBy.
    await prisma.candidate.create({
      data: {
        firstName: 'Sans', lastName: 'Bsp', phone: '5145550003', city: 'Montréal', createdById: admin.id,
        hasBSP: false, availableNights: true, lat: 45.5029, lng: -73.5684,
      },
    });
    // Disponible de jour seulement → exclu sur le quart.
    await prisma.candidate.create({
      data: {
        firstName: 'Jour', lastName: 'Seulement', phone: '5145550004', city: 'Montréal', createdById: admin.id,
        hasBSP: true, availableDays: true, lat: 45.5039, lng: -73.5694,
      },
    });
    // Archivé → ne doit même pas être évalué.
    await prisma.candidate.create({
      data: {
        firstName: 'Archive', lastName: 'Ancien', phone: '5145550005', city: 'Montréal', createdById: admin.id,
        hasBSP: true, availableNights: true, lat: 45.5019, lng: -73.5674, isArchived: true,
      },
    });
  });

  describe('authentification et rôles', () => {
    it('sans token → 401', async () => {
      expect((await request(app).get('/api/mandates')).status).toBe(401);
    });

    it('SALES peut lire la liste → 200', async () => {
      const res = await request(app).get('/api/mandates').set('Authorization', `Bearer ${salesToken}`);
      expect(res.status).toBe(200);
    });

    it('SALES ne peut pas coter un mandat → 403', async () => {
      const res = await request(app)
        .patch(`/api/mandates/${mandateId}`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ monotony: 5 });
      expect(res.status).toBe(403);
    });
  });

  describe('validation', () => {
    it('id non-UUID → 400', async () => {
      const res = await request(app)
        .get('/api/mandates/pas-un-uuid')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });

    it('champ inconnu refusé (.strict, anti affectation de masse) → 400', async () => {
      const res = await request(app)
        .patch(`/api/mandates/${mandateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ monotony: 3, externalId: 'PIRATE-001' });
      expect(res.status).toBe(400);
    });

    it("l'adresse géocodée n'est pas modifiable par ce chemin → 400", async () => {
      // lat/lng appartiennent à l'import + au géocodage : les exposer ici
      // permettrait de déplacer un site sans trace.
      const res = await request(app)
        .patch(`/api/mandates/${mandateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ lat: 0, lng: 0 });
      expect(res.status).toBe(400);
    });

    it('cote hors bornes 1-5 → 400', async () => {
      const res = await request(app)
        .patch(`/api/mandates/${mandateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ monotony: 9 });
      expect(res.status).toBe(400);
    });

    it('mandat inexistant → 404', async () => {
      const res = await request(app)
        .get('/api/mandates/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('liste', () => {
    it('renvoie les mandats avec leur profil et la pagination', async () => {
      const res = await request(app).get('/api/mandates').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
      expect(res.body.data[0]).toHaveProperty('requiresBSP');
    });

    it('unratedOnly ne garde que les mandats jamais cotés', async () => {
      const res = await request(app)
        .get('/api/mandates?unratedOnly=true')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((m: { id: string }) => m.id)).toEqual([unratedMandateId]);
    });

    it('recherche sur le nom du site', async () => {
      const res = await request(app)
        .get('/api/mandates?search=Ville Marie')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(mandateId);
    });
  });

  describe('PATCH profil', () => {
    it('enregistre les cotes et horodate la saisie', async () => {
      const res = await request(app)
        .patch(`/api/mandates/${unratedMandateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          siteType: 'CHANTIER', monotony: 4, autonomy: 5, conflictFrequency: 2,
          requiresVehicle: true, headcount: 3, clientName: 'Client A',
        });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        siteType: 'CHANTIER', monotony: 4, autonomy: 5, requiresVehicle: true, headcount: 3,
      });
      expect(res.body.data.profileUpdatedAt).not.toBeNull();
    });

    it('normalise les langues saisies librement', async () => {
      const res = await request(app)
        .patch(`/api/mandates/${unratedMandateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ requiredLanguages: ['Français', 'anglais', 'FR'] });
      expect(res.status).toBe(200);
      expect(res.body.data.requiredLanguages.sort()).toEqual(['EN', 'FR']);
    });

    it('null remet une cote à « non coté »', async () => {
      const res = await request(app)
        .patch(`/api/mandates/${unratedMandateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ monotony: null });
      expect(res.status).toBe(200);
      expect(res.body.data.monotony).toBeNull();
    });
  });

  describe('jumelage — GET /:id/candidates', () => {
    it('classe les candidats éligibles par distance', async () => {
      const res = await request(app)
        .get(`/api/mandates/${mandateId}/candidates`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const noms = res.body.data.candidates.map((c: { firstName: string }) => c.firstName);
      expect(noms).toEqual(['Proche', 'Loin']);
      expect(res.body.data.candidates[0].distanceKm).toBeLessThan(
        res.body.data.candidates[1].distanceKm
      );
      expect(res.body.data.candidates[0].reasons).toContain('BSP valide');
    });

    it('explique les exclusions plutôt que de renvoyer une liste courte muette', async () => {
      const res = await request(app)
        .get(`/api/mandates/${mandateId}/candidates`)
        .set('Authorization', `Bearer ${adminToken}`);
      // L'archivé n'est même pas évalué : 4 candidats joignables sur 5 créés.
      expect(res.body.meta.evaluated).toBe(4);
      expect(res.body.meta.eligible).toBe(2);
      expect(res.body.meta.excludedBy).toMatchObject({
        'BSP manquant': 1,
        'Non disponible : nuit': 1,
      });
    });

    it('includeIneligible=false n ramène PAS les écartés', async () => {
      // Régression : `z.coerce.boolean()` aurait lu la chaîne 'false' comme
      // `true` (Boolean('false') === true), donc un filtre explicitement
      // désactivé se serait comporté comme activé.
      const res = await request(app)
        .get(`/api/mandates/${mandateId}/candidates?includeIneligible=false`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.candidates).toHaveLength(2);
      expect(res.body.data.candidates.every((c: { eligible: boolean }) => c.eligible)).toBe(true);
    });

    it('unratedOnly=false ne filtre pas la liste des mandats', async () => {
      const res = await request(app)
        .get('/api/mandates?unratedOnly=false')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(1);
    });

    it('includeIneligible ramène les écartés, après les proposables', async () => {
      const res = await request(app)
        .get(`/api/mandates/${mandateId}/candidates?includeIneligible=true`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.data.candidates).toHaveLength(4);
      expect(res.body.data.candidates.slice(0, 2).every((c: { eligible: boolean }) => c.eligible)).toBe(true);
      expect(res.body.data.candidates.slice(2).every((c: { eligible: boolean }) => !c.eligible)).toBe(true);
    });

    it('un mandat sans exigence ni quart ne bloque personne', async () => {
      const ouvert = await prisma.mandate.create({
        data: { externalId: 'S00500', name: 'Site ouvert', city: 'Montréal', requiresBSP: false },
      });
      const res = await request(app)
        .get(`/api/mandates/${ouvert.id}/candidates`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.meta.eligible).toBe(4);
      // Mandat non géocodé → distance inconnue pour tout le monde, sans exclusion.
      expect(res.body.data.candidates.every((c: { distanceKm: null }) => c.distanceKm === null)).toBe(true);
    });
  });
});
