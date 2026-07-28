import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';
import { tagPerson } from '../services/contractLeads.service';

/**
 * Filtre `?contractCode=` et enrichissement `contracts[]` de la liste des
 * prospects.
 *
 * Deux risques couverts ici :
 *  - `prospectQueryFilters` est `.strict()` : un paramètre non déclaré ferait
 *    répondre 400 à TOUTE la liste des prospects, pas seulement au filtre ;
 *  - la recherche texte pose déjà `where.id` — le filtre contrat doit
 *    INTERSECTER, pas écraser, sans quoi le texte cherché disparaîtrait
 *    silencieusement des critères.
 */
describe('Prospects — filtre par contrat', () => {
  let app: Express;
  let adminToken: string;
  let taggedId: string;
  let untaggedId: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.pcf@test.com', password: pw, firstName: 'A', lastName: 'P', role: 'ADMIN', isActive: true },
    });
    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });

    const tagged = await prisma.prospectCandidate.create({
      data: { firstName: 'Marie', lastName: 'Tremblay', phone: '5145551111', city: 'Montréal' },
    });
    const untagged = await prisma.prospectCandidate.create({
      data: { firstName: 'Paul', lastName: 'Gagnon', phone: '5145552222', city: 'Montréal' },
    });
    taggedId = tagged.id;
    untaggedId = untagged.id;

    await tagPerson({ contractCode: 'PSB', personType: 'prospect', personId: taggedId });
  });

  it('sans filtre : la liste répond 200 et expose contracts[] sur chaque prospect', async () => {
    const res = await request(app).get('/api/prospects').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const marie = res.body.data.find((p: any) => p.id === taggedId);
    const paul = res.body.data.find((p: any) => p.id === untaggedId);
    expect(marie.contracts).toEqual(['PSB']);
    expect(paul.contracts).toEqual([]);
  });

  it('?contractCode=PSB ne renvoie que les prospects tagués', async () => {
    const res = await request(app)
      .get('/api/prospects?contractCode=PSB')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: any) => p.id)).toEqual([taggedId]);
  });

  it('?contractCode= vide est un no-op (ne filtre rien)', async () => {
    const res = await request(app)
      .get('/api/prospects?contractCode=')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('le code est insensible à la casse', async () => {
    const res = await request(app)
      .get('/api/prospects?contractCode=psb')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: any) => p.id)).toEqual([taggedId]);
  });

  it('recherche + contrat s\'INTERSECTENT (le filtre n\'écrase pas la recherche)', async () => {
    // « Paul » n'est pas tagué PSB → l'intersection doit être vide, et surtout
    // pas « tous les PSB » (ce que produirait un écrasement de where.id).
    const res = await request(app)
      .get('/api/prospects?contractCode=PSB&search=Gagnon')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);

    // « Marie » est taguée → elle ressort bien de l'intersection.
    const hit = await request(app)
      .get('/api/prospects?contractCode=PSB&search=Tremblay')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(hit.body.data.map((p: any) => p.id)).toEqual([taggedId]);
  });

  it('un contrat inconnu renvoie une liste vide, pas une erreur', async () => {
    const res = await request(app)
      .get('/api/prospects?contractCode=INEXISTANT')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('le détail d\'un prospect expose aussi contracts[]', async () => {
    const res = await request(app)
      .get(`/api/prospects/${taggedId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.contracts).toEqual(['PSB']);
  });
});
