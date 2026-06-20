import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Extraction IA — /api/extraction (extraction.controller).
 *
 * Routes (extraction.routes.ts) :
 *   POST /api/extraction/candidates/:id/extract
 *   POST /api/extraction/prospects/:id/extract
 * Toutes deux protégées par `authenticateStaff` + `authorizeRoles('ADMIN','RH_RECRUITER')`.
 *
 * Couvre :
 *  - garde d'auth : 401 sans token, 403 token CLIENT (portail), 403 staff SALES
 *    (authentifié mais rôle hors liste autorisée) ;
 *  - 404 candidat / prospect introuvable (avant tout appel IA) ;
 *  - 400 chemin « CV sans texte » (le controller garde sur un texte vide) ;
 *  - chemins heureux candidat (OpenAI) et prospect (Claude) avec assertions
 *    réelles sur la réponse ET sur la sauvegarde des compétences extraites.
 *
 * Services externes mockés (zéro réseau, zéro filesystem) :
 *  - ai-extraction.service  → extractWithOpenAI / extractWithClaude
 *  - cv-extraction.service  → getCandidateText / saveExtractedSkills / saveProspectSkills
 * On garde `jest.requireActual` puis on n'override QUE le singleton exporté pour
 * ne pas casser le chargement des autres modules.
 */

// --- Mocks des services (réseau IA + lecture CV disque + écriture compétences) ---
jest.mock('../services/ai-extraction.service', () => {
  const actual = jest.requireActual('../services/ai-extraction.service');
  return {
    ...actual,
    aiExtractionService: {
      extractWithOpenAI: jest.fn(),
      extractWithClaude: jest.fn(),
    },
  };
});

jest.mock('../services/cv-extraction.service', () => {
  const actual = jest.requireActual('../services/cv-extraction.service');
  return {
    ...actual,
    cvExtractionService: {
      getCandidateText: jest.fn(),
      saveExtractedSkills: jest.fn(),
      saveProspectSkills: jest.fn(),
    },
  };
});

// Importés APRÈS jest.mock pour récupérer les versions mockées.
import { createApp } from '../app';
import { aiExtractionService } from '../services/ai-extraction.service';
import { cvExtractionService } from '../services/cv-extraction.service';

const mockedAI = aiExtractionService as jest.Mocked<typeof aiExtractionService>;
const mockedCV = cvExtractionService as jest.Mocked<typeof cvExtractionService>;

/** Résumé d'extraction IA réussi minimal (forme AIExtractionSummary). */
function successSummary(candidateId: string, method: 'OPENAI' | 'CLAUDE', model: string) {
  return {
    candidateId,
    skillsFound: [
      {
        skillId: 'skill-1',
        skillName: 'Surveillance',
        confidence: 0.9,
        extractedText: 'agent de sécurité',
      },
    ],
    totalSkills: 1,
    processingTimeMs: 5,
    method,
    model,
    promptTokens: 10,
    completionTokens: 5,
    totalCost: 0.0001,
    success: true,
  };
}

describe('Extraction IA — /api/extraction', () => {
  let app: Express;

  let adminToken: string;
  let rhToken: string;
  let salesToken: string;
  let clientToken: string;

  let candidateId: string;
  let prospectId: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.extract@test.com', password: pw, firstName: 'Admin', lastName: 'Staff', role: 'ADMIN', isActive: true },
    });
    const rh = await prisma.user.create({
      data: { email: 'rh.extract@test.com', password: pw, firstName: 'Rh', lastName: 'Recruteur', role: 'RH_RECRUITER', isActive: true },
    });
    // SALES : staff authentifié MAIS hors de la liste authorizeRoles d'extraction.
    const sales = await prisma.user.create({
      data: { email: 'sales.extract@test.com', password: pw, firstName: 'Sales', lastName: 'Staff', role: 'SALES', isActive: true },
    });

    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    rhToken = generateAccessToken({ userId: rh.id, email: rh.email!, role: rh.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });

    // Token role:'CLIENT' résolu via la table `clients` (cf. passport jwt strategy).
    const clientAccount = await prisma.client.create({
      data: { name: 'Portail Client', email: 'portail.extract@client.com', password: pw, isActive: true },
    });
    clientToken = generateAccessToken({ userId: clientAccount.id, email: clientAccount.email, role: 'CLIENT' });

    // Candidat réel (champs requis : firstName/lastName/phone/city).
    const candidate = await prisma.candidate.create({
      data: { firstName: 'Jean', lastName: 'Tremblay', phone: '5145551234', city: 'Montréal', createdById: admin.id },
    });
    candidateId = candidate.id;

    // Prospect réel.
    const prospect = await prisma.prospectCandidate.create({
      data: { firstName: 'Marie', lastName: 'Gagnon', phone: '5145559876' },
    });
    prospectId = prospect.id;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Par défaut : CV avec du texte exploitable.
    mockedCV.getCandidateText.mockResolvedValue('CV: agent de sécurité expérimenté');
    mockedCV.saveExtractedSkills.mockResolvedValue(undefined as any);
    mockedCV.saveProspectSkills.mockResolvedValue(undefined as any);
  });

  describe("garde d'authentification (authenticateStaff)", () => {
    it('sans token → 401', async () => {
      const res = await request(app).post(`/api/extraction/candidates/${candidateId}/extract`).send({});
      expect(res.status).toBe(401);
      expect(mockedAI.extractWithOpenAI).not.toHaveBeenCalled();
    });

    it('token CLIENT (portail) → 403', async () => {
      const res = await request(app)
        .post(`/api/extraction/candidates/${candidateId}/extract`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({});
      expect(res.status).toBe(403);
      expect(mockedAI.extractWithOpenAI).not.toHaveBeenCalled();
    });
  });

  describe('garde de rôle (authorizeRoles ADMIN/RH_RECRUITER)', () => {
    it('SALES (staff non autorisé) → 403', async () => {
      const res = await request(app)
        .post(`/api/extraction/candidates/${candidateId}/extract`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({});
      expect(res.status).toBe(403);
      expect(mockedAI.extractWithOpenAI).not.toHaveBeenCalled();
    });
  });

  describe('POST /candidates/:id/extract', () => {
    it('candidat introuvable → 404 (aucun appel IA)', async () => {
      const res = await request(app)
        .post('/api/extraction/candidates/00000000-0000-0000-0000-000000000000/extract')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/non trouvé/i);
      expect(mockedCV.getCandidateText).not.toHaveBeenCalled();
      expect(mockedAI.extractWithOpenAI).not.toHaveBeenCalled();
    });

    it('CV sans texte → 400 (aucun appel IA)', async () => {
      mockedCV.getCandidateText.mockResolvedValueOnce('   ');
      const res = await request(app)
        .post(`/api/extraction/candidates/${candidateId}/extract`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/aucun texte/i);
      expect(mockedAI.extractWithOpenAI).not.toHaveBeenCalled();
      expect(mockedCV.saveExtractedSkills).not.toHaveBeenCalled();
    });

    it('chemin heureux OpenAI → 200 + sauvegarde des compétences', async () => {
      mockedAI.extractWithOpenAI.mockResolvedValue(
        successSummary(candidateId, 'OPENAI', 'gpt-3.5-turbo') as any
      );

      const res = await request(app)
        .post(`/api/extraction/candidates/${candidateId}/extract`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.method).toBe('OPENAI');
      expect(res.body.skillsFound).toHaveLength(1);

      // Le controller appelle OpenAI par défaut (pas Claude) avec le texte du CV.
      expect(mockedAI.extractWithOpenAI).toHaveBeenCalledTimes(1);
      expect(mockedAI.extractWithClaude).not.toHaveBeenCalled();
      expect(mockedAI.extractWithOpenAI).toHaveBeenCalledWith(
        candidateId,
        'CV: agent de sécurité expérimenté',
        'gpt-3.5-turbo'
      );
      // Compétences trouvées → sauvegardées comme extraction candidat.
      expect(mockedCV.saveExtractedSkills).toHaveBeenCalledTimes(1);
      expect(mockedCV.saveProspectSkills).not.toHaveBeenCalled();
    });

    it('extraction sans compétence → 200 mais aucune sauvegarde', async () => {
      mockedAI.extractWithOpenAI.mockResolvedValue({
        ...successSummary(candidateId, 'OPENAI', 'gpt-3.5-turbo'),
        skillsFound: [],
        totalSkills: 0,
      } as any);

      const res = await request(app)
        .post(`/api/extraction/candidates/${candidateId}/extract`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.skillsFound).toHaveLength(0);
      // Garde du controller : ne sauvegarde que si success && skillsFound.length > 0.
      expect(mockedCV.saveExtractedSkills).not.toHaveBeenCalled();
    });
  });

  describe('POST /prospects/:id/extract', () => {
    it('prospect introuvable → 404 (aucun appel IA)', async () => {
      const res = await request(app)
        .post('/api/extraction/prospects/00000000-0000-0000-0000-000000000000/extract')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/non trouvé/i);
      expect(mockedAI.extractWithClaude).not.toHaveBeenCalled();
    });

    it('chemin heureux Claude → 200 + sauvegarde côté prospect', async () => {
      mockedAI.extractWithClaude.mockResolvedValue(
        successSummary(prospectId, 'CLAUDE', 'claude-3-haiku') as any
      );

      const res = await request(app)
        .post(`/api/extraction/prospects/${prospectId}/extract`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ method: 'CLAUDE', model: 'claude-3-haiku' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.method).toBe('CLAUDE');

      // Branche CLAUDE choisie ; getCandidateText appelé en mode prospect (isProspect=true).
      expect(mockedCV.getCandidateText).toHaveBeenCalledWith(prospectId, true);
      expect(mockedAI.extractWithClaude).toHaveBeenCalledTimes(1);
      expect(mockedAI.extractWithOpenAI).not.toHaveBeenCalled();
      // Sauvegarde via saveProspectSkills (et non saveExtractedSkills).
      expect(mockedCV.saveProspectSkills).toHaveBeenCalledTimes(1);
      expect(mockedCV.saveExtractedSkills).not.toHaveBeenCalled();
    });
  });
});
