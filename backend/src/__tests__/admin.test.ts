import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Admin — /api/admin
 *
 * Outils ADMIN de "re-conversion" : un candidat (qualifié) auto-créé par l'IA
 * peut être renvoyé vers la table des prospects (`ProspectCandidate`) puis
 * soft-deleté de `Candidate`. Toutes les routes sont gardées par
 * `authenticateJWT + authorizeRoles('ADMIN')`.
 *
 * Couvre :
 *  - la garde d'auth/rôle : 401 sans token, 403 pour un token non-ADMIN (SALES),
 *    403 pour un token CLIENT (signé sur un vrai prisma.client, sinon passport → 401) ;
 *  - la validation : 400 sur un body batch sans liste d'IDs ;
 *  - 404 : re-conversion d'un candidat introuvable / déjà supprimé ;
 *  - chemins heureux avec assertions réelles : GET liste les auto-convertis,
 *    POST single crée un prospect + soft-delete le candidat + écrit un AuditLog.
 *
 * Les modèles externes (R2/Stripe/email/IA) ne sont pas touchés par ce
 * controller ; aucun mock réseau n'est donc nécessaire.
 */
describe('Admin — /api/admin', () => {
  let app: Express;

  let adminId: string;
  let adminToken: string;
  let salesToken: string;
  let clientToken: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: {
        email: 'admin.admin@test.com',
        password: pw,
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
      },
    });
    const sales = await prisma.user.create({
      data: {
        email: 'sales.admin@test.com',
        password: pw,
        firstName: 'Sales',
        lastName: 'User',
        role: 'SALES',
        isActive: true,
      },
    });
    // PIÈGE connu : un token role:'CLIENT' est résolu par passport via la table
    // `clients` (PAS `users`). Pour obtenir un vrai 403 (et non un 401 "client
    // introuvable"), on signe le token sur l'id d'un vrai prisma.client.
    const client = await prisma.client.create({
      data: {
        name: 'Client Test',
        email: 'client.admin@test.com',
        companyName: 'ACME inc.',
        password: pw,
      },
    });

    adminId = admin.id;
    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });
    clientToken = generateAccessToken({ userId: client.id, email: client.email!, role: 'CLIENT' });
  });

  // Recrée un candidat "auto-converti" frais (les tests qui mutent le supprimant).
  const makeAutoConvertedCandidate = (overrides: Record<string, unknown> = {}) =>
    prisma.candidate.create({
      data: {
        firstName: 'Jean',
        lastName: 'Tremblay',
        email: 'jean.tremblay@test.com',
        phone: '5145550199',
        city: 'Montréal',
        hrNotes: 'Auto-Converti par IA le 2026-06-01',
        createdById: adminId,
        ...overrides,
      },
    });

  describe('garde auth + rôle', () => {
    it('GET /auto-converted-candidates sans token → 401', async () => {
      const res = await request(app).get('/api/admin/auto-converted-candidates');
      expect(res.status).toBe(401);
    });

    it('GET /auto-converted-candidates token SALES → 403 (réservé ADMIN)', async () => {
      const res = await request(app)
        .get('/api/admin/auto-converted-candidates')
        .set('Authorization', `Bearer ${salesToken}`);
      expect(res.status).toBe(403);
    });

    it('GET /auto-converted-candidates token CLIENT → 403 (réservé ADMIN)', async () => {
      const res = await request(app)
        .get('/api/admin/auto-converted-candidates')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(403);
    });

    it('POST /revert-batch... token SALES → 403 (mutation réservée ADMIN)', async () => {
      const res = await request(app)
        .post('/api/admin/revert-batch-candidates-to-prospects')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ ids: ['x'] });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /auto-converted-candidates (findAutoConvertedCandidates)', () => {
    it('ADMIN → liste uniquement les candidats marqués Auto-Converti', async () => {
      await cleanDatabase();
      // (cleanDatabase a effacé admin → on le recrée car createdById est requis)
      const pw = await hashPassword('Test1234');
      const admin = await prisma.user.create({
        data: { email: 'admin.admin@test.com', password: pw, firstName: 'Admin', lastName: 'User', role: 'ADMIN', isActive: true },
      });
      adminId = admin.id;
      adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });

      await makeAutoConvertedCandidate();
      // Candidat NON auto-converti : ne doit pas apparaître.
      await prisma.candidate.create({
        data: { firstName: 'Manuel', lastName: 'Saisi', phone: '5145550100', city: 'Laval', hrNotes: 'Entrevue OK', createdById: adminId },
      });

      const res = await request(app)
        .get('/api/admin/auto-converted-candidates')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(res.body.candidates).toHaveLength(1);
      expect(res.body.candidates[0].firstName).toBe('Jean');
      // La sélection ne renvoie que des champs sûrs (pas de hrNotes complet leak côté RH ? si, ici hrNotes est volontairement renvoyé).
      expect(res.body.candidates[0]).toHaveProperty('hrNotes');
    });
  });

  describe('POST /revert-candidate-to-prospect/:id (revertSingleCandidateToProspect)', () => {
    it('candidat introuvable → 404', async () => {
      const res = await request(app)
        .post('/api/admin/revert-candidate-to-prospect/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/non trouv/i);
    });

    it('ADMIN → crée un prospect, soft-delete le candidat et écrit un AuditLog', async () => {
      const candidate = await makeAutoConvertedCandidate({
        email: 'unique.revert@test.com',
        phone: '5145559999',
        cvUrl: 'https://cdn.test/cv.pdf',
        cvStoragePath: 'cv/jean.pdf',
        address: '1 rue Test',
        province: 'QC',
        postalCode: 'H2X1Y4',
      });

      const res = await request(app)
        .post(`/api/admin/revert-candidate-to-prospect/${candidate.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.prospectId).toBeTruthy();

      // Le prospect a été créé en préservant le CV et les coordonnées.
      const prospect = await prisma.prospectCandidate.findUnique({ where: { id: res.body.prospectId } });
      expect(prospect).not.toBeNull();
      expect(prospect!.firstName).toBe('Jean');
      expect(prospect!.email).toBe('unique.revert@test.com');
      expect(prospect!.cvUrl).toBe('https://cdn.test/cv.pdf');
      expect(prospect!.cvStoragePath).toBe('cv/jean.pdf');
      expect(prospect!.isConverted).toBe(false);

      // Le candidat est soft-deleté (pas effacé physiquement).
      const after = await prisma.candidate.findUnique({ where: { id: candidate.id } });
      expect(after!.isDeleted).toBe(true);
      expect(after!.deletedAt).not.toBeNull();

      // Un AuditLog UPDATE/Candidate a été écrit par l'admin.
      const log = await prisma.auditLog.findFirst({
        where: { resource: 'Candidate', resourceId: candidate.id, action: 'UPDATE' },
      });
      expect(log).not.toBeNull();
      expect(log!.userId).toBe(adminId);
    });

    it('candidat déjà soft-deleté → 404 (traité comme introuvable)', async () => {
      const deleted = await makeAutoConvertedCandidate({
        email: 'deja.supprime@test.com',
        phone: '5145558888',
        isDeleted: true,
        deletedAt: new Date(),
      });
      const res = await request(app)
        .post(`/api/admin/revert-candidate-to-prospect/${deleted.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /revert-batch-candidates-to-prospects (revertBatchCandidatesToProspects)', () => {
    it('body sans liste d\'IDs → 400 (validation)', async () => {
      const res = await request(app)
        .post('/api/admin/revert-batch-candidates-to-prospects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalide|vide/i);
    });

    it('liste vide → 400 (validation)', async () => {
      const res = await request(app)
        .post('/api/admin/revert-batch-candidates-to-prospects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [] });
      expect(res.status).toBe(400);
    });

    it('ADMIN → traite le lot : un id valide réussit, un id inconnu remonte en erreur partielle', async () => {
      const ok = await makeAutoConvertedCandidate({ email: 'batch.ok@test.com', phone: '5145557777' });
      const missingId = '00000000-0000-0000-0000-000000000999';

      const res = await request(app)
        .post('/api/admin/revert-batch-candidates-to-prospects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [ok.id, missingId] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.results).toHaveLength(2);

      const okResult = res.body.results.find((r: any) => r.id === ok.id);
      const missResult = res.body.results.find((r: any) => r.id === missingId);
      expect(okResult.status).toBe('success');
      expect(okResult.prospectId).toBeTruthy();
      expect(missResult.status).toBe('error');

      // Le candidat valide a bien été soft-deleté.
      const after = await prisma.candidate.findUnique({ where: { id: ok.id } });
      expect(after!.isDeleted).toBe(true);
    });
  });
});
