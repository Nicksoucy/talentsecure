import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * GET /api/dashboard/overview — agrégat (catalogues / conversions / employés /
 * activité récente). On vérifie la garde d'auth (staff) et le contrat de
 * réponse (enveloppe success + forme des compteurs), sur données réelles seedées.
 */
describe('Dashboard — GET /api/dashboard/overview', () => {
  let app: Express;
  let adminToken: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test123456');
    const admin = await prisma.user.create({
      data: { email: 'admin.dash@test.com', password: pw, firstName: 'Admin', lastName: 'Dash', role: 'ADMIN', isActive: true },
    });
    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });

    // Un employé actif, pour vérifier qu'un compteur de l'agrégat n'est pas vide
    // (les catalogues exigent un clientId — chaîne FK évitée ici).
    await prisma.employee.create({
      data: { firstName: 'Emp', lastName: 'Loyé', phone: '514-555-0000', status: 'ACTIF' },
    });
  });

  it('sans token → 401', async () => {
    const res = await request(app).get('/api/dashboard/overview');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('avec token staff → 200 + enveloppe { success, data } et compteurs numériques', async () => {
    const res = await request(app)
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const d = res.body.data;
    expect(typeof d.catalogues.total).toBe('number');
    expect(typeof d.conversions.total).toBe('number');
    expect(typeof d.employees.total).toBe('number');
    expect(Array.isArray(d.recentActivity)).toBe(true);
  });

  it('reflète les données seedées (≥ 1 employé actif)', async () => {
    const res = await request(app)
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.employees.active).toBeGreaterThanOrEqual(1);
  });
});
