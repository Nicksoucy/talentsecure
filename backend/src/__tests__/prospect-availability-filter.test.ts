import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Filtre `?availability=` de la liste des candidats potentiels.
 *
 * Les 5 colonnes `available*` étaient affichées (colonne « Disponibilités »)
 * mais rien ne permettait de s'en servir pour chercher. Trois risques couverts
 * ici :
 *  - `prospectQueryFilters` est `.strict()` : un paramètre non déclaré ferait
 *    répondre 400 à TOUTE la liste, pas seulement au filtre ;
 *  - plusieurs quarts doivent se combiner en ET, pas en OU — sinon « soir +
 *    fin de semaine » ramène des gens qui ne couvrent qu'une moitié du besoin ;
 *  - un profil 24/7 doit ressortir de chaque quart, sans quoi la personne la
 *    plus disponible de toutes disparaît des résultats.
 */
describe('Prospects — filtre par disponibilités', () => {
  let app: Express;
  let adminToken: string;
  let soirId: string;
  let soirFdsId: string;
  let jourId: string;
  let toujoursId: string;
  let inconnuId: string;

  const ids = (res: request.Response) => res.body.data.map((p: any) => p.id).sort();

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.paf@test.com', password: pw, firstName: 'A', lastName: 'F', role: 'ADMIN', isActive: true },
    });
    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });

    const make = (phone: string, dispos: Record<string, boolean> = {}) =>
      prisma.prospectCandidate.create({
        data: { firstName: 'Test', lastName: 'Dispo', city: 'Montréal', phone, ...dispos },
      });

    soirId = (await make('5145550001', { availableEvenings: true })).id;
    soirFdsId = (await make('5145550002', { availableEvenings: true, availableWeekends: true })).id;
    jourId = (await make('5145550003', { availableDays: true })).id;
    // 24/7 tel qu'écrit en base : le drapeau ET les 4 quarts (normalizeAvailability).
    toujoursId = (await make('5145550004', {
      available24_7: true,
      availableDays: true,
      availableEvenings: true,
      availableNights: true,
      availableWeekends: true,
    })).id;
    // Personne sans disponibilité déclarée (le cas le plus courant en base).
    inconnuId = (await make('5145550005')).id;
  });

  it('sans filtre : tout le monde ressort', async () => {
    const res = await request(app).get('/api/prospects').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([soirId, soirFdsId, jourId, toujoursId, inconnuId].sort());
  });

  it('?availability=evenings ne renvoie que les disponibles de soir (24/7 compris)', async () => {
    const res = await request(app)
      .get('/api/prospects?availability=evenings')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([soirId, soirFdsId, toujoursId].sort());
  });

  it('deux quarts se combinent en ET, pas en OU', async () => {
    const res = await request(app)
      .get('/api/prospects?availability=evenings,weekends')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // `soirId` ne fait que les soirs → exclu. Le OU l'aurait laissé passer.
    expect(ids(res)).toEqual([soirFdsId, toujoursId].sort());
  });

  it('un profil 24/7 ressort de n\'importe quel quart', async () => {
    for (const shift of ['days', 'evenings', 'nights', 'weekends']) {
      const res = await request(app)
        .get(`/api/prospects?availability=${shift}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((p: any) => p.id)).toContain(toujoursId);
    }
  });

  it('?availability=24/7 ne garde que les entièrement disponibles', async () => {
    const res = await request(app)
      .get('/api/prospects?availability=24%2F7')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([toujoursId]);
  });

  it('?availability= vide est un no-op (ne filtre rien)', async () => {
    const res = await request(app)
      .get('/api/prospects?availability=')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(5);
  });

  it('un jeton inconnu est ignoré, il ne vide pas la liste', async () => {
    const res = await request(app)
      .get('/api/prospects?availability=matins,evenings')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([soirId, soirFdsId, toujoursId].sort());
  });

  it('le filtre se combine avec les autres critères (ville)', async () => {
    const res = await request(app)
      .get('/api/prospects?availability=days&city=Qu%C3%A9bec')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
