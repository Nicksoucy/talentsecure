import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Disponibilités des candidats — les 5 cases du formulaire GHL
 * « Renseignements étudiants » (24/7, jour, soir, nuit, fin de semaine).
 *
 * Les colonnes `available*` sont la source de vérité : ce sont elles que lisent
 * l'aperçu de la fiche, les badges, la recherche avancée et le portail client.
 * Elles n'étaient écrites par AUCUN chemin de code — d'où « Non spécifié »
 * partout et 0 résultat sur tous les filtres. La table `availabilities` reste
 * alimentée en miroir (filet de retour arrière).
 */
describe('Candidats — disponibilités', () => {
  let app: Express;
  let rhToken: string;
  let salesToken: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const rh = await prisma.user.create({
      data: { email: 'rh.dispo@test.com', password: pw, firstName: 'R', lastName: 'H', role: 'RH_RECRUITER', isActive: true },
    });
    const sales = await prisma.user.create({
      data: { email: 'sales.dispo@test.com', password: pw, firstName: 'S', lastName: 'A', role: 'SALES', isActive: true },
    });
    rhToken = generateAccessToken({ userId: rh.id, email: rh.email!, role: rh.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });
  });

  const base = (over: Record<string, unknown> = {}) => ({
    firstName: 'Alex',
    lastName: 'Gagnon',
    phone: '514-555-0111',
    city: 'Montréal',
    ...over,
  });

  it('sans token → 401', async () => {
    const res = await request(app).post('/api/candidates').send(base());
    expect(res.status).toBe(401);
  });

  it('token SALES → 403 (création réservée ADMIN/RH)', async () => {
    const res = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${salesToken}`)
      .send(base());
    expect(res.status).toBe(403);
  });

  it('POST : les quarts cochés remplissent les colonnes ET la relation', async () => {
    const res = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${rhToken}`)
      .send(base({ phone: '514-555-0112', availableEvenings: true, availableWeekends: true }));

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      available24_7: false,
      availableDays: false,
      availableEvenings: true,
      availableNights: false,
      availableWeekends: true,
    });
    expect(res.body.data.availabilities.map((a: any) => a.type).sort())
      .toEqual(['FIN_DE_SEMAINE', 'SOIR']);
  });

  it('POST : 24/7 force les quatre quarts (sinon absent des filtres « jour »)', async () => {
    const res = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${rhToken}`)
      .send(base({ phone: '514-555-0113', available24_7: true }));

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      available24_7: true,
      availableDays: true,
      availableEvenings: true,
      availableNights: true,
      availableWeekends: true,
    });
  });

  it('POST : un type de disponibilité inexistant → 400 de validation, pas une erreur Prisma', async () => {
    const res = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${rhToken}`)
      .send(base({ phone: '514-555-0114', availabilities: [{ type: 'JOUR_SEMAINE' }] }));

    expect(res.status).toBe(400);
  });

  it('PUT : tout décocher efface bien les disponibilités (colonnes + relation)', async () => {
    const created = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${rhToken}`)
      .send(base({ phone: '514-555-0115', available24_7: true }));
    const id = created.body.data.id;

    const res = await request(app)
      .put(`/api/candidates/${id}`)
      .set('Authorization', `Bearer ${rhToken}`)
      .send({
        available24_7: false,
        availableDays: false,
        availableEvenings: false,
        availableNights: false,
        availableWeekends: false,
        availabilities: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.availabilities).toEqual([]);
    expect(res.body.data).toMatchObject({
      available24_7: false,
      availableDays: false,
      availableEvenings: false,
      availableNights: false,
      availableWeekends: false,
    });
  });

  it('PUT sans mention des disponibilités → elles restent intactes', async () => {
    const created = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${rhToken}`)
      .send(base({ phone: '514-555-0116', availableNights: true }));
    const id = created.body.data.id;

    const res = await request(app)
      .put(`/api/candidates/${id}`)
      .set('Authorization', `Bearer ${rhToken}`)
      .send({ hrNotes: 'Rappeler lundi' });

    expect(res.status).toBe(200);
    expect(res.body.data.availableNights).toBe(true);
    expect(res.body.data.availabilities.map((a: any) => a.type)).toEqual(['NUIT']);
  });

  it('recherche avancée : le filtre « evenings » ne retourne que les candidats du soir', async () => {
    await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${rhToken}`)
      .send(base({ firstName: 'Soirée', phone: '514-555-0117', availableEvenings: true }));
    await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${rhToken}`)
      .send(base({ firstName: 'Jourée', phone: '514-555-0118', availableDays: true }));

    const res = await request(app)
      .post('/api/candidates/advanced-search')
      .set('Authorization', `Bearer ${rhToken}`)
      .send({ availability: ['evenings'] });

    expect(res.status).toBe(200);
    const prenoms = res.body.data.map((c: any) => c.firstName);
    expect(prenoms).toContain('Soirée');
    expect(prenoms).not.toContain('Jourée');
  });

  it('recherche avancée : un candidat 24/7 ressort du filtre « jour »', async () => {
    const res = await request(app)
      .post('/api/candidates/advanced-search')
      .set('Authorization', `Bearer ${rhToken}`)
      .send({ availability: ['days'] });

    expect(res.status).toBe(200);
    // Le candidat créé en 24/7 plus haut doit être dans les résultats.
    expect(res.body.data.some((c: any) => c.available24_7 === true)).toBe(true);
  });
});
