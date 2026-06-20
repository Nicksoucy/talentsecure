import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Prospect scoring — GET /api/prospects/:id/analysis
 * (prospect-scoring.controller → getProspectAnalysis).
 *
 * La route est montée sous `authenticateStaff` (src/routes/prospect.routes.ts,
 * `router.use(authenticateStaff)`) puis `validate({ params: uuidParam })`. Aucune
 * garde de rôle : tout staff authentifié peut lire l'analyse. Le contrôleur lit
 * la table `prospect_analyses` (modèle ProspectAnalysis), écrite hors-ligne par
 * la slash-command /analyze-prospects → AUCUN appel IA / réseau côté serveur,
 * donc rien à mocker ici.
 *
 * Couvre :
 *  - auth (authenticateStaff) : 401 sans token, 403 pour un token CLIENT
 *    (signé sur un vrai prisma.client, sinon passport renvoie 401) ;
 *  - validation : 400 sur :id non-UUID (uuidParam) ;
 *  - 404 : prospect/UUID sans analyse persistée ;
 *  - chemins heureux : 200 + verdict complet pour un prospect analysé,
 *    et lecture autorisée pour un staff non-ADMIN (SALES).
 */

describe('Prospect scoring — GET /api/prospects/:id/analysis', () => {
  let app: Express;

  let adminToken: string;
  let salesToken: string;
  let clientToken: string;

  let analyzedProspectId: string; // prospect AVEC analyse persistée
  let unanalyzedProspectId: string; // prospect SANS analyse

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.pscoring@test.com', password: pw, firstName: 'Admin', lastName: 'Staff', role: 'ADMIN', isActive: true },
    });
    // SALES : staff authentifié (la route n'impose aucun rôle → doit pouvoir lire).
    const sales = await prisma.user.create({
      data: { email: 'sales.pscoring@test.com', password: pw, firstName: 'Sales', lastName: 'Staff', role: 'SALES', isActive: true },
    });

    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });

    // Token portail CLIENT : signé sur un VRAI prisma.client (sinon passport → 401),
    // afin de tester réellement le rejet 403 d'authenticateStaff.
    const clientAccount = await prisma.client.create({
      data: { name: 'Portail Client', email: 'portail.pscoring@client.com', password: pw, isActive: true },
    });
    clientToken = generateAccessToken({ userId: clientAccount.id, email: clientAccount.email, role: 'CLIENT' });

    // Prospect analysé : on persiste une analyse complète (comme la slash-command).
    const analyzed = await prisma.prospectCandidate.create({
      data: {
        firstName: 'Jean', lastName: 'Tremblay', email: 'jean.pscoring@prospect.com',
        phone: '5145551111', city: 'Montréal', isConverted: false, isDeleted: false,
      },
    });
    analyzedProspectId = analyzed.id;

    await prisma.prospectAnalysis.create({
      data: {
        prospectId: analyzed.id,
        score: 87,
        tier: 'gold',
        recommendation: 'INTERVIEW_PRIORITY',
        summary: 'Profil senior avec forte expérience terrain.',
        strengths: ['10 ans en sécurité', 'Bilingue'],
        redFlags: ['Trou de 6 mois en 2022'],
        workEnvironments: [{ type: 'corporate', label: 'Tour de bureaux', yearsApprox: 4, employer: 'GardaWorld' }],
        reasoning: 'Score élevé : expérience pertinente, références solides.',
        rubricVersion: 'v1',
        model: 'claude-haiku-4-5-20251001',
        cvHash: 'abc123',
        promptTokens: 1200,
        completionTokens: 400,
        processingTimeMs: 2500,
      },
    });

    // Prospect SANS analyse → doit renvoyer 404 sur la route.
    const unanalyzed = await prisma.prospectCandidate.create({
      data: {
        firstName: 'Marie', lastName: 'Gagnon', email: 'marie.pscoring@prospect.com',
        phone: '5145552222', city: 'Laval', isConverted: false, isDeleted: false,
      },
    });
    unanalyzedProspectId = unanalyzed.id;
  });

  describe("garde d'authentification (authenticateStaff)", () => {
    it('sans token → 401', async () => {
      const res = await request(app).get(`/api/prospects/${analyzedProspectId}/analysis`);
      expect(res.status).toBe(401);
    });

    it('token CLIENT → 403 (back-office interdit aux comptes portail)', async () => {
      const res = await request(app)
        .get(`/api/prospects/${analyzedProspectId}/analysis`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('validation (uuidParam)', () => {
    it('id non-UUID → 400', async () => {
      const res = await request(app)
        .get('/api/prospects/pas-un-uuid/analysis')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('404 (analyse absente)', () => {
    it('prospect existant SANS analyse → 404', async () => {
      const res = await request(app)
        .get(`/api/prospects/${unanalyzedProspectId}/analysis`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/aucune analyse/i);
    });

    it('UUID inexistant → 404 (aucune analyse rattachée)', async () => {
      const res = await request(app)
        .get('/api/prospects/00000000-0000-0000-0000-000000000000/analysis')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/aucune analyse/i);
    });
  });

  describe('chemins heureux', () => {
    it('ADMIN — prospect analysé → 200 + verdict complet', async () => {
      const res = await request(app)
        .get(`/api/prospects/${analyzedProspectId}/analysis`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.analysis).toMatchObject({
        prospectId: analyzedProspectId,
        score: 87,
        tier: 'gold',
        recommendation: 'INTERVIEW_PRIORITY',
        rubricVersion: 'v1',
      });
      // Tableaux Postgres natifs renvoyés tels quels.
      expect(res.body.analysis.strengths).toEqual(['10 ans en sécurité', 'Bilingue']);
      expect(res.body.analysis.redFlags).toContain('Trou de 6 mois en 2022');
    });

    it('SALES (staff non-ADMIN) — lecture autorisée → 200 (aucune garde de rôle)', async () => {
      const res = await request(app)
        .get(`/api/prospects/${analyzedProspectId}/analysis`)
        .set('Authorization', `Bearer ${salesToken}`);
      expect(res.status).toBe(200);
      expect(res.body.analysis.prospectId).toBe(analyzedProspectId);
    });
  });
});
