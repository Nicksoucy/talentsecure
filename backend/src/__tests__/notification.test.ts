import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

// Aucun envoi réseau réel : on neutralise les deux providers d'email que
// dispatchPendingNotifications() peut appeler pour le canal EMAIL.
jest.mock('../services/email.service', () => ({
  __esModule: true,
  sendEmail: jest.fn().mockResolvedValue({ messageId: 'test' }),
  EMAIL_RH: 'rh@test.local',
  EMAIL_PAIE: 'paie@test.local',
}));
jest.mock('../services/ghl-email.service', () => ({
  __esModule: true,
  sendEmailViaGhl: jest.fn().mockResolvedValue({ messageId: 'test-ghl' }),
}));

/**
 * Notifications — /api/notifications.
 *
 * Couvre :
 *   - la garde JWT + rôle (ADMIN / RH_RECRUITER) sur les endpoints user-facing ;
 *   - le token-gate de l'endpoint interne /internal/dispatch (INTERNAL_JOB_TOKEN) ;
 *   - la liste IN_APP (forme { items, unreadCount }, filtre unreadOnly, isolation
 *     par utilisateur) ;
 *   - mark-all-read (passe readAt + status=READ, ne touche que ses propres notifs) ;
 *   - un dispatch heureux d'une notif IN_APP PENDING → SENT (sans envoi externe).
 *
 * routes : src/routes/notification.routes.ts
 * controller : src/controllers/notification.controller.ts
 */
describe('Notifications — /api/notifications', () => {
  let app: Express;
  let adminId: string;
  let rhId: string;
  let otherAdminId: string;
  let adminToken: string;
  let salesToken: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.notif@test.com', password: pw, firstName: 'Admin', lastName: 'Notif', role: 'ADMIN', isActive: true },
    });
    const rh = await prisma.user.create({
      data: { email: 'rh.notif@test.com', password: pw, firstName: 'Rh', lastName: 'Notif', role: 'RH_RECRUITER', isActive: true },
    });
    const otherAdmin = await prisma.user.create({
      data: { email: 'other.notif@test.com', password: pw, firstName: 'Other', lastName: 'Admin', role: 'ADMIN', isActive: true },
    });
    const sales = await prisma.user.create({
      data: { email: 'sales.notif@test.com', password: pw, firstName: 'Sales', lastName: 'Notif', role: 'SALES', isActive: true },
    });

    adminId = admin.id;
    rhId = rh.id;
    otherAdminId = otherAdmin.id;
    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });
  });

  // --- garde d'authentification / rôle -------------------------------------

  describe('garde de rôle', () => {
    it('GET / sans token → 401', async () => {
      const res = await request(app).get('/api/notifications');
      expect(res.status).toBe(401);
    });

    it('GET / token SALES → 403 (réservé ADMIN/RH_RECRUITER)', async () => {
      const res = await request(app).get('/api/notifications').set('Authorization', `Bearer ${salesToken}`);
      expect(res.status).toBe(403);
    });

    it('POST /mark-all-read token SALES → 403', async () => {
      const res = await request(app)
        .post('/api/notifications/mark-all-read')
        .set('Authorization', `Bearer ${salesToken}`);
      expect(res.status).toBe(403);
    });
  });

  // --- GET / (list) ---------------------------------------------------------

  describe('GET / (list IN_APP)', () => {
    beforeEach(async () => {
      // On ne purge que la table notifications pour préserver les users semés.
      await prisma.notification.deleteMany({});
    });

    it('ADMIN → { items, unreadCount } ; ne renvoie que les IN_APP du user', async () => {
      // 2 notifs IN_APP pour l'admin (1 lue, 1 non-lue), 1 EMAIL standalone,
      // 1 IN_APP pour un AUTRE user → ne doivent PAS fuiter.
      await prisma.notification.createMany({
        data: [
          { userId: adminId, type: 'UNIFORM_LOW_STOCK', channel: 'IN_APP', status: 'SENT', title: 'Lue', message: 'm', readAt: new Date() },
          { userId: adminId, type: 'UNIFORM_RETURN_OVERDUE', channel: 'IN_APP', status: 'SENT', title: 'Non lue', message: 'm' },
          { userId: null, type: 'UNIFORM_DEBT_AGING', channel: 'EMAIL', status: 'PENDING', recipientEmail: 'rh@test.local', title: 'Email', message: 'm' },
          { userId: rhId, type: 'UNIFORM_LOW_STOCK', channel: 'IN_APP', status: 'SENT', title: 'Pour RH', message: 'm' },
        ],
      });

      const res = await request(app).get('/api/notifications').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.unreadCount).toBe(1);
      const titles = res.body.data.items.map((n: any) => n.title);
      expect(titles).not.toContain('Pour RH'); // isolation par user
      expect(titles).not.toContain('Email'); // canal EMAIL exclu
    });

    it('ADMIN ?unreadOnly=true → ne renvoie que les non-lues', async () => {
      await prisma.notification.createMany({
        data: [
          { userId: adminId, type: 'UNIFORM_LOW_STOCK', channel: 'IN_APP', status: 'SENT', title: 'Lue', message: 'm', readAt: new Date() },
          { userId: adminId, type: 'UNIFORM_RETURN_OVERDUE', channel: 'IN_APP', status: 'SENT', title: 'Non lue', message: 'm' },
        ],
      });

      const res = await request(app)
        .get('/api/notifications?unreadOnly=true')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].title).toBe('Non lue');
    });
  });

  // --- POST /mark-all-read --------------------------------------------------

  describe('POST /mark-all-read', () => {
    it('marque toutes ses IN_APP non-lues comme lues, sans toucher celles des autres', async () => {
      await prisma.notification.deleteMany({});
      await prisma.notification.createMany({
        data: [
          { userId: adminId, type: 'UNIFORM_LOW_STOCK', channel: 'IN_APP', status: 'SENT', title: 'a1', message: 'm' },
          { userId: adminId, type: 'UNIFORM_RETURN_OVERDUE', channel: 'IN_APP', status: 'SENT', title: 'a2', message: 'm' },
          { userId: rhId, type: 'UNIFORM_LOW_STOCK', channel: 'IN_APP', status: 'SENT', title: 'r1', message: 'm' },
        ],
      });

      const res = await request(app)
        .post('/api/notifications/mark-all-read')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/lues/i);

      const adminUnread = await prisma.notification.count({ where: { userId: adminId, readAt: null } });
      const rhUnread = await prisma.notification.count({ where: { userId: rhId, readAt: null } });
      expect(adminUnread).toBe(0); // les siennes sont lues
      expect(rhUnread).toBe(1); // celles du RH intactes
    });
  });

  // --- POST /:id/read -------------------------------------------------------

  describe('POST /:id/read', () => {
    it('marque sa notif comme lue (readAt + status READ)', async () => {
      await prisma.notification.deleteMany({});
      const notif = await prisma.notification.create({
        data: { userId: adminId, type: 'UNIFORM_LOW_STOCK', channel: 'IN_APP', status: 'SENT', title: 't', message: 'm' },
      });

      const res = await request(app)
        .post(`/api/notifications/${notif.id}/read`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const after = await prisma.notification.findUnique({ where: { id: notif.id } });
      expect(after?.readAt).not.toBeNull();
      expect(after?.status).toBe('READ');
    });

    it("ne marque PAS la notif d'un autre user (updateMany scoping → reste non-lue)", async () => {
      await prisma.notification.deleteMany({});
      // Notif appartenant à un AUTRE admin : l'admin courant ne doit pas la lire.
      const foreign = await prisma.notification.create({
        data: { userId: otherAdminId, type: 'UNIFORM_LOW_STOCK', channel: 'IN_APP', status: 'SENT', title: 't', message: 'm' },
      });

      const res = await request(app)
        .post(`/api/notifications/${foreign.id}/read`)
        .set('Authorization', `Bearer ${adminToken}`);
      // L'endpoint répond 200 (updateMany no-op) mais ne mute rien : la garde
      // d'isolation est dans le `where: { id, userId }`.
      expect(res.status).toBe(200);
      const after = await prisma.notification.findUnique({ where: { id: foreign.id } });
      expect(after?.readAt).toBeNull();
      expect(after?.status).toBe('SENT');
    });
  });

  // --- POST /internal/dispatch (token-gated, pas de JWT) --------------------

  describe('POST /internal/dispatch (token interne)', () => {
    const TOKEN = 'secret-internal-token';
    let prevToken: string | undefined;

    beforeAll(() => {
      prevToken = process.env.INTERNAL_JOB_TOKEN;
      process.env.INTERNAL_JOB_TOKEN = TOKEN;
    });
    afterAll(() => {
      process.env.INTERNAL_JOB_TOKEN = prevToken;
    });

    it('sans header x-internal-token → 403', async () => {
      const res = await request(app).post('/api/notifications/internal/dispatch');
      expect(res.status).toBe(403);
    });

    it('token erroné → 403', async () => {
      const res = await request(app)
        .post('/api/notifications/internal/dispatch')
        .set('x-internal-token', 'mauvais');
      expect(res.status).toBe(403);
    });

    it('bon token → 200 et dispatch une notif IN_APP PENDING en SENT (sans envoi externe)', async () => {
      await prisma.notification.deleteMany({});
      const pending = await prisma.notification.create({
        data: { userId: adminId, type: 'UNIFORM_LOW_STOCK', channel: 'IN_APP', status: 'PENDING', title: 't', message: 'm' },
      });

      const res = await request(app)
        .post('/api/notifications/internal/dispatch')
        .set('x-internal-token', TOKEN);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ sent: 1, failed: 0, skipped: 0 });

      const after = await prisma.notification.findUnique({ where: { id: pending.id } });
      expect(after?.status).toBe('SENT');
      expect(after?.sentAt).not.toBeNull();
    });
  });
});
