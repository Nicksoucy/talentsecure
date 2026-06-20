import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { generateAccessToken } from '../utils/jwt';

// Filet anti-réseau : pour une ville INCONNUE, le service déclenche un géocodage
// Nominatim EN ARRIÈRE-PLAN (non awaité). On mocke axios pour qu'aucun appel
// réel ne parte, même en tâche de fond. Les chemins testés ici (code postal via
// centroïdes FSA offline + ville du seed statique) n'appellent jamais axios.
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: [] }) },
}));

/**
 * Couche HTTP de /api/geo/resolve : garde d'authentification staff (401/403),
 * validation des paramètres (400), 404 quand rien ne résout, et les chemins
 * heureux 100% OFFLINE — code postal (centroïde FSA QC) et ville (seed statique).
 * Aucun appel réseau réel (géocodage Nominatim mocké).
 */
describe('Routes géo — /api/geo/resolve', () => {
  let app: Express;
  let staffToken: string;
  let clientToken: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();

    // Utilisateur staff (rôle autorisé) — un token suffit, la route ne lit pas
    // l'utilisateur en base (passport décode le JWT signé avec JWT_SECRET de test).
    const staff = await prisma.user.create({
      data: {
        email: 'staff.geo@test.com',
        password: 'x',
        firstName: 'Staff',
        lastName: 'Geo',
        role: 'SALES',
        isActive: true,
      },
    });
    staffToken = generateAccessToken({ userId: staff.id, email: staff.email!, role: staff.role });

    // Compte CLIENT — rejeté par authenticateStaff (403) même avec un JWT valide.
    // La stratégie passport résout un token role:'CLIENT' via la table `clients`
    // (pas `users`) : on crée donc un vrai Client et on signe le token sur son id.
    const client = await prisma.client.create({
      data: {
        name: 'Client Geo',
        email: 'client.geo@test.com',
        isActive: true,
      },
    });
    clientToken = generateAccessToken({ userId: client.id, email: client.email!, role: 'CLIENT' });
  });

  it('401 sans token', async () => {
    const res = await request(app).get('/api/geo/resolve?q=H2X1Y4');
    expect(res.status).toBe(401);
  });

  it('403 pour un token CLIENT (endpoint staff)', async () => {
    const res = await request(app)
      .get('/api/geo/resolve?q=H2X1Y4')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });

  it('400 si aucun paramètre (ni q, ni postalCode, ni city)', async () => {
    const res = await request(app)
      .get('/api/geo/resolve')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/q, postalCode ou city/i);
  });

  it('résout un code postal (q) → source "postal" + coordonnées QC', async () => {
    const res = await request(app)
      .get('/api/geo/resolve?q=H2X 1Y4')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toBe('postal');
    expect(typeof res.body.data.lat).toBe('number');
    expect(typeof res.body.data.lng).toBe('number');
    // Borne grossière du Québec : la résolution doit tomber dans la province.
    expect(res.body.data.lat).toBeGreaterThan(44);
    expect(res.body.data.lat).toBeLessThan(63);
    expect(res.body.data.lng).toBeLessThan(-57);
  });

  it('résout un code postal explicite (postalCode) → source "postal"', async () => {
    const res = await request(app)
      .get('/api/geo/resolve?postalCode=H3A0G4')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('postal');
  });

  it('résout une ville du seed (city) → source "city"', async () => {
    const res = await request(app)
      .get('/api/geo/resolve?city=Laval')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toBe('city');
    expect(typeof res.body.data.lat).toBe('number');
    expect(typeof res.body.data.lng).toBe('number');
  });

  it('404 pour une localisation introuvable au Québec', async () => {
    // Ville inexistante du seed → null synchrone (le géocodage de fond est mocké
    // et de toute façon non awaité) → 404.
    const res = await request(app)
      .get('/api/geo/resolve?city=ZzzVilleQuiNexistePas')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/introuvable/i);
  });
});
