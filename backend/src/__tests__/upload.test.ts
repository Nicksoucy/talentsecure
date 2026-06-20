import request from 'supertest';
import type { Express } from 'express';
import * as path from 'path';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Upload de CV candidat — routes montées par candidate.routes via upload.controller :
 *   POST   /api/candidates/:id/cv            (uploadCandidateCV)   — ADMIN, RH_RECRUITER
 *   GET    /api/candidates/:id/cv/download   (downloadCandidateCV) — tout staff authentifié
 *   DELETE /api/candidates/:id/cv            (deleteCandidateCV)   — ADMIN, RH_RECRUITER
 *
 * Ces endpoints touchent du stockage binaire (R2 ou disque). On NE teste PAS le
 * flux binaire réel : on couvre l'auth (401/403), la validation (400 :id et
 * fichier manquant), les 404 métier, et 2 chemins heureux (download local,
 * delete) en stubbant `cv.service` pour rester sans réseau ni effet de bord
 * disque.
 *
 * `video.service` (videoUpload) est laissé RÉEL : candidate.routes l'importe au
 * chargement et le mocker entièrement casserait le module. En test, USE_R2 est
 * absent → la couche stockage prend le chemin local (aucun appel réseau).
 */

// On stub cv.service : le contrôleur appelle processCVUpload (upload) /
// getLocalCVPath + useR2=false (download) / deleteCV (delete). On garde le reste
// du module intact.
jest.mock('../services/cv.service', () => {
  const actual = jest.requireActual('../services/cv.service');
  return {
    ...actual,
    processCVUpload: jest.fn(async () => 'uploads/cvs/stubbed-cv.pdf'),
    deleteCV: jest.fn(async () => undefined),
    getLocalCVPath: jest.fn(),
  };
});

// optimizeImage ne doit jamais lancer sharp en test (le contrôleur l'appelle
// pour les images, mais on uploade un PDF — stub par sécurité).
jest.mock('../services/image.service', () => ({
  optimizeImage: jest.fn(async () => undefined),
}));

import { getLocalCVPath, processCVUpload, deleteCV } from '../services/cv.service';

const PDF_BYTES = Buffer.from('%PDF-1.4\n%stub cv\n');

describe('Upload CV candidat — /api/candidates/:id/cv', () => {
  let app: Express;

  let adminToken: string;
  let salesToken: string;
  let magasinToken: string;
  let clientToken: string;

  let adminId: string;
  let candidateWithCvId: string;
  let candidateNoCvId: string;
  let deletedCandidateId: string;

  const NON_EXISTENT = '00000000-0000-0000-0000-000000000000';

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test123456');

    const admin = await prisma.user.create({
      data: { email: 'admin.up@test.com', password: pw, firstName: 'Admin', lastName: 'Up', role: 'ADMIN', isActive: true },
    });
    const sales = await prisma.user.create({
      data: { email: 'sales.up@test.com', password: pw, firstName: 'Sales', lastName: 'Up', role: 'SALES', isActive: true },
    });
    // MAGASIN : staff authentifié mais hors de authorizeRoles(ADMIN, RH_RECRUITER).
    const magasin = await prisma.user.create({
      data: { email: 'magasin.up@test.com', password: pw, firstName: 'Maga', lastName: 'Sin', role: 'MAGASIN', isActive: true },
    });
    adminId = admin.id;

    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });
    magasinToken = generateAccessToken({ userId: magasin.id, email: magasin.email!, role: magasin.role });

    // Token portail CLIENT : doit être rejeté par authenticateStaff (403).
    const clientAccount = await prisma.client.create({
      data: { name: 'Portail', email: 'portail.up@client.com', password: pw, isActive: true },
    });
    clientToken = generateAccessToken({ userId: clientAccount.id, email: clientAccount.email, role: 'CLIENT' });

    const withCv = await prisma.candidate.create({
      data: {
        firstName: 'Avec', lastName: 'CV', phone: '514-000-0001', city: 'Montreal',
        status: 'EN_ATTENTE', createdById: admin.id,
        cvUrl: `/api/candidates/x/cv/download`, cvStoragePath: 'uploads/cvs/existing.pdf',
      },
    });
    candidateWithCvId = withCv.id;

    const noCv = await prisma.candidate.create({
      data: { firstName: 'Sans', lastName: 'CV', phone: '514-000-0002', city: 'Laval', status: 'EN_ATTENTE', createdById: admin.id },
    });
    candidateNoCvId = noCv.id;

    const deleted = await prisma.candidate.create({
      data: {
        firstName: 'Supprime', lastName: 'CV', phone: '514-000-0003', city: 'Quebec',
        status: 'EN_ATTENTE', createdById: admin.id, isDeleted: true,
        cvStoragePath: 'uploads/cvs/deleted.pdf',
      },
    });
    deletedCandidateId = deleted.id;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("garde d'authentification (authenticateStaff)", () => {
    it('POST /cv sans token → 401', async () => {
      const res = await request(app)
        .post(`/api/candidates/${candidateNoCvId}/cv`)
        .attach('cv', PDF_BYTES, { filename: 'cv.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(401);
    });

    it('POST /cv avec token CLIENT → 403 (back-office interdit au portail)', async () => {
      const res = await request(app)
        .post(`/api/candidates/${candidateNoCvId}/cv`)
        .set('Authorization', `Bearer ${clientToken}`)
        .attach('cv', PDF_BYTES, { filename: 'cv.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(403);
    });
  });

  describe('garde de rôle (authorizeRoles ADMIN, RH_RECRUITER)', () => {
    it('SALES ne peut pas uploader → 403', async () => {
      const res = await request(app)
        .post(`/api/candidates/${candidateNoCvId}/cv`)
        .set('Authorization', `Bearer ${salesToken}`)
        .attach('cv', PDF_BYTES, { filename: 'cv.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(403);
      // Le contrôleur d'upload ne doit jamais être atteint.
      expect(processCVUpload).not.toHaveBeenCalled();
    });

    it('MAGASIN ne peut pas supprimer → 403', async () => {
      const res = await request(app)
        .delete(`/api/candidates/${candidateWithCvId}/cv`)
        .set('Authorization', `Bearer ${magasinToken}`);
      expect(res.status).toBe(403);
      expect(deleteCV).not.toHaveBeenCalled();
    });
  });

  describe('validation des paramètres et du fichier', () => {
    it('POST /cv avec :id non-UUID → 400 (validate params)', async () => {
      const res = await request(app)
        .post('/api/candidates/pas-un-uuid/cv')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('cv', PDF_BYTES, { filename: 'cv.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(400);
    });

    it('POST /cv sans fichier → 400 « Aucun fichier fourni »', async () => {
      const res = await request(app)
        .post(`/api/candidates/${candidateNoCvId}/cv`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/aucun fichier/i);
    });
  });

  describe('cas 404 métier', () => {
    it('POST /cv sur candidat inexistant → 404', async () => {
      const res = await request(app)
        .post(`/api/candidates/${NON_EXISTENT}/cv`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('cv', PDF_BYTES, { filename: 'cv.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(404);
      // Candidat absent → on ne pousse jamais le fichier vers le stockage.
      expect(processCVUpload).not.toHaveBeenCalled();
    });

    it('GET /cv/download sur candidat sans CV → 404', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candidateNoCvId}/cv/download`)
        .set('Authorization', `Bearer ${salesToken}`);
      expect(res.status).toBe(404);
    });

    it('DELETE /cv sur candidat sans CV → 404 « Aucun CV à supprimer »', async () => {
      const res = await request(app)
        .delete(`/api/candidates/${candidateNoCvId}/cv`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/aucun cv/i);
      expect(deleteCV).not.toHaveBeenCalled();
    });

    it('GET /cv/download sur candidat soft-deleted → 404', async () => {
      const res = await request(app)
        .get(`/api/candidates/${deletedCandidateId}/cv/download`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('chemins heureux', () => {
    it('GET /cv/download (stockage local) → renvoie le fichier en pièce jointe', async () => {
      // useR2=false en test : le contrôleur sert le fichier local via res.download.
      // On pointe getLocalCVPath vers un vrai fichier du repo pour exercer le download.
      const realFile = path.join(__dirname, 'setup.ts');
      (getLocalCVPath as jest.Mock).mockReturnValue(realFile);

      const res = await request(app)
        .get(`/api/candidates/${candidateWithCvId}/cv/download`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(getLocalCVPath).toHaveBeenCalledWith('uploads/cvs/existing.pdf');
      expect(res.headers['content-disposition']).toMatch(/attachment/i);
      // Le nom de fichier proposé est construit à partir du candidat.
      expect(res.headers['content-disposition']).toMatch(/CV_Avec_CV/);
    });

    it('DELETE /cv sur candidat avec CV → 200, champs CV nettoyés + audit log', async () => {
      // Candidat dédié pour ne pas interférer avec les autres cas.
      const cand = await prisma.candidate.create({
        data: {
          firstName: 'A', lastName: 'Effacer', phone: '514-000-0009', city: 'Gatineau',
          status: 'EN_ATTENTE', createdById: adminId,
          cvUrl: '/api/candidates/y/cv/download', cvStoragePath: 'uploads/cvs/todelete.pdf',
        },
      });

      const res = await request(app)
        .delete(`/api/candidates/${cand.id}/cv`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/supprimé/i);
      expect(deleteCV).toHaveBeenCalledWith('uploads/cvs/todelete.pdf');

      // Les champs CV doivent être nettoyés en base.
      const after = await prisma.candidate.findUnique({ where: { id: cand.id } });
      expect(after?.cvUrl).toBeNull();
      expect(after?.cvStoragePath).toBeNull();

      // Audit log DELETE écrit.
      const log = await prisma.auditLog.findFirst({
        where: { resource: 'Candidate', resourceId: cand.id, action: 'DELETE' },
      });
      expect(log).not.toBeNull();
    });
  });
});
