import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Couche HTTP des routes vidéos typées du candidat (auth, validation du type,
 * 404). L'upload réel (stockage R2/GCS) n'est pas testé ici — il est couvert au
 * niveau service ; ici on vérifie le routage, l'autorisation et les cas vides.
 */
describe('Routes vidéos candidat — /api/candidates/:id/videos', () => {
  let app: Express;
  let adminToken: string;
  let salesToken: string;
  let candidateId: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test123456');

    const admin = await prisma.user.create({
      data: { email: 'admin.vid@test.com', password: pw, firstName: 'Admin', lastName: 'Vid', role: 'ADMIN', isActive: true },
    });
    const sales = await prisma.user.create({
      data: { email: 'sales.vid@test.com', password: pw, firstName: 'Sales', lastName: 'Vid', role: 'SALES', isActive: true },
    });
    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });

    const cand = await prisma.candidate.create({
      data: { firstName: 'Jean', lastName: 'Test', phone: '514-000-0000', city: 'Montreal', status: 'EN_ATTENTE', createdById: admin.id },
    });
    candidateId = cand.id;
  });

  it('GET /videos → liste vide pour un candidat sans vidéo', async () => {
    const res = await request(app)
      .get(`/api/candidates/${candidateId}/videos`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('GET /videos → 401 sans token', async () => {
    const res = await request(app).get(`/api/candidates/${candidateId}/videos`);
    expect(res.status).toBe(401);
  });

  it('GET /videos → 404 pour un candidat inexistant', async () => {
    const res = await request(app)
      .get('/api/candidates/00000000-0000-0000-0000-000000000000/videos')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /videos/:type/url → 400 pour un type invalide', async () => {
    const res = await request(app)
      .get(`/api/candidates/${candidateId}/videos/foobar/url`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('GET /videos/interview/url → 404 si aucune vidéo de ce type', async () => {
    const res = await request(app)
      .get(`/api/candidates/${candidateId}/videos/interview/url`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('DELETE /videos/interview → 404 si aucune vidéo', async () => {
    const res = await request(app)
      .delete(`/api/candidates/${candidateId}/videos/interview`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('DELETE /videos/interview → 403 pour un rôle SALES (écriture interdite)', async () => {
    const res = await request(app)
      .delete(`/api/candidates/${candidateId}/videos/interview`)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(403);
  });
});
