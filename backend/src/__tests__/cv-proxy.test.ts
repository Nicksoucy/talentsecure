import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * CV proxy — GET /api/prospects/cv-proxy (controllers/cv-proxy.controller).
 *
 * Endpoint de proxy même-origine : la requête prend ?url=<cv-url> et streame
 * les octets du CV (GHL/S3/GCS/R2…) pour contourner CORS côté front. Monté sur
 * le routeur prospects, donc protégé par `authenticateStaff` (router.use) — pas
 * de garde de rôle supplémentaire (tout staff authentifié y a accès).
 *
 * Stratégie de test (endpoint binaire/proxy) : on couvre l'AUTH (401/403) et la
 * VALIDATION synchrone de l'URL (400 url manquante, 400 URL non parsable, 400
 * protocole non http(s), 403 host hors allowlist). Tous ces chemins retournent
 * AVANT le moindre appel réseau (le `https.get` n'est atteint que pour un host
 * autorisé). On ne déclenche donc JAMAIS de fetch sortant réel : aucun service
 * externe à mocker, zéro réseau.
 *
 * Note : on n'exerce pas le chemin "host autorisé" car il ouvrirait une vraie
 * connexion sortante (le flux binaire R2/GHL n'a pas à être exécuté en test).
 */

const PROXY = '/api/prospects/cv-proxy';

describe('CV proxy — GET /api/prospects/cv-proxy', () => {
  let app: Express;

  let staffToken: string; // utilisateur staff (RH) — accès autorisé
  let clientToken: string; // token portail CLIENT — rejeté par authenticateStaff

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const staff = await prisma.user.create({
      data: {
        email: 'staff.cvproxy@test.com',
        password: pw,
        firstName: 'Staff',
        lastName: 'Proxy',
        role: 'RH_RECRUITER',
        isActive: true,
      },
    });
    staffToken = generateAccessToken({ userId: staff.id, email: staff.email!, role: staff.role });

    // Token portail CLIENT : signé sur un VRAI prisma.client (sinon la stratégie
    // passport ne résout aucun user → 401 au lieu du 403 attendu).
    const clientAccount = await prisma.client.create({
      data: { name: 'Portail Proxy', email: 'portail.cvproxy@client.com', password: pw, isActive: true },
    });
    clientToken = generateAccessToken({ userId: clientAccount.id, email: clientAccount.email, role: 'CLIENT' });
  });

  describe("garde d'authentification (authenticateStaff)", () => {
    it('sans token → 401', async () => {
      const res = await request(app).get(PROXY).query({ url: 'https://x.amazonaws.com/cv.pdf' });
      expect(res.status).toBe(401);
    });

    it('token CLIENT → 403 (proxy back-office interdit aux comptes portail)', async () => {
      const res = await request(app)
        .get(PROXY)
        .query({ url: 'https://x.amazonaws.com/cv.pdf' })
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('validation du paramètre url (avant tout appel réseau)', () => {
    it('sans paramètre url → 400', async () => {
      const res = await request(app)
        .get(PROXY)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/url manquant/i);
    });

    it('url vide → 400', async () => {
      const res = await request(app)
        .get(PROXY)
        .query({ url: '' })
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/url manquant/i);
    });

    it('url non parsable → 400 (URL invalide)', async () => {
      const res = await request(app)
        .get(PROXY)
        .query({ url: 'pas-une-url' })
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/url invalide/i);
    });

    it('protocole non http(s) (ftp) → 400', async () => {
      const res = await request(app)
        .get(PROXY)
        .query({ url: 'ftp://x.amazonaws.com/cv.pdf' })
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/http\(s\)/i);
    });
  });

  describe("allowlist d'hôtes", () => {
    it('host hors allowlist → 403 (anti-proxy ouvert)', async () => {
      const res = await request(app)
        .get(PROXY)
        .query({ url: 'https://evil.example.com/cv.pdf' })
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/host non autorisé/i);
    });

    it('host se terminant par un suffixe autorisé mais usurpé → 403 (pas de match partiel sournois)', async () => {
      // "amazonaws.com.evil.com" NE se termine PAS par ".amazonaws.com" → refusé.
      const res = await request(app)
        .get(PROXY)
        .query({ url: 'https://amazonaws.com.evil.com/cv.pdf' })
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/host non autorisé/i);
    });
  });
});
