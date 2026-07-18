import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Mandats (sites) — /api/mandates/stats/map-points (couche rose des cartes).
 * Garde d'auth staff + regroupement par coordonnées + libellé = nom(s) du/des
 * mandat(s). Aucune donnée sensible (les descriptions ne sont pas stockées).
 */
describe('Mandates — /api/mandates/stats/map-points', () => {
  let app: Express;
  let salesToken: string;
  let clientToken: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const sales = await prisma.user.create({
      data: { email: 'sales.mandate@test.com', password: pw, firstName: 'S', lastName: 'M', role: 'SALES', isActive: true },
    });
    const client = await prisma.client.create({
      data: { name: 'Client M', email: 'client.mandate@test.com', password: pw },
    });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });
    clientToken = generateAccessToken({ userId: client.id, email: client.email, role: 'CLIENT' });

    await prisma.mandate.createMany({
      data: [
        // Deux mandats à la MÊME adresse (postes YHU) → regroupés, libellé = noms.
        { externalId: 'GAR-A1', name: 'YHU Poste 1', lat: 45.52, lng: -73.42, geocodeSource: 'address', city: 'Longueuil' },
        { externalId: 'GAR-A2', name: 'YHU Poste 2', lat: 45.52, lng: -73.42, geocodeSource: 'address', city: 'Longueuil' },
        // Un mandat au secteur postal.
        { externalId: 'GAR-B', name: '333 Sherbrooke Est', lat: 45.51, lng: -73.56, geocodeSource: 'postal', postalCode: 'H2X 4E3', city: 'Montréal' },
        // Un mandat non plaçable (adresse « f ») → compté dans unplaced.
        { externalId: 'S00147', name: 'Modèle de projet', lat: null, lng: null },
        // Un mandat supprimé → exclu.
        { externalId: 'GAR-DEL', name: 'Ancien site', lat: 45.6, lng: -73.6, geocodeSource: 'address', isDeleted: true, deletedAt: new Date() },
      ],
    });
  });

  it('sans token → 401', async () => {
    const res = await request(app).get('/api/mandates/stats/map-points');
    expect(res.status).toBe(401);
  });

  it('token CLIENT → 403 (réservé staff)', async () => {
    const res = await request(app)
      .get('/api/mandates/stats/map-points')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });

  it('SALES → 200 : regroupement par coordonnées, libellé = noms, supprimé exclu, non placés comptés', async () => {
    const res = await request(app)
      .get('/api/mandates/stats/map-points')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const points = res.body.data.points as Array<{ lat: number; lng: number; count: number; source: string; label: string }>;
    // Les 2 postes YHU (mêmes coords) → 1 point, libellé = les deux noms.
    const yhu = points.find((p) => p.lat === 45.52 && p.lng === -73.42)!;
    expect(yhu).toBeDefined();
    expect(yhu.count).toBe(2);
    expect(yhu.label.split(', ').sort()).toEqual(['YHU Poste 1', 'YHU Poste 2']);
    // Le mandat au secteur postal est aussi nommé (nameLabelSources inclut 'postal').
    const sherb = points.find((p) => p.lat === 45.51)!;
    expect(sherb.label).toBe('333 Sherbrooke Est');
    // Le mandat supprimé n'apparaît pas.
    expect(points.some((p) => p.lat === 45.6)).toBe(false);
    // Le mandat sans coordonnées compte comme non placé.
    expect(res.body.data.unplaced).toBe(1);
  });
});
