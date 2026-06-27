import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Employés — /api/employees (back-office).
 *
 * Toutes les routes passent par authenticateJWT + authorizeReadWrite :
 *   - lecture (GET)  : ADMIN, RH_RECRUITER, SALES, MAGASIN, MAGASIN_GESTION
 *   - écriture (POST/PUT/DELETE, dont promotions) : ADMIN, RH_RECRUITER
 *
 * On couvre : la garde d'auth (401 sans token, 403 token CLIENT, 403 rôle
 * lecture-seule en écriture), la validation de paramètre (400 UUID invalide),
 * le 404, la détection de doublon (409), et deux chemins heureux avec
 * assertions réelles (liste paginée + indicateur de brouillons, promotion d'un
 * candidat en employé qui soft-delete le candidat).
 *
 * PIÈGE : un token role:'CLIENT' est résolu par passport via la table `clients`
 * (PAS `users`). Pour tester la garde staff (403), on signe le token sur l'id
 * d'un VRAI prisma.client.create(...), sinon passport renvoie 401 (client
 * introuvable) et le test mentirait sur la raison du rejet.
 */
describe('Employees — /api/employees', () => {
  let app: Express;
  let adminToken: string;
  let rhToken: string;
  let salesToken: string;
  let clientToken: string;
  let adminId: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.emp@test.com', password: pw, firstName: 'Admin', lastName: 'Emp', role: 'ADMIN', isActive: true },
    });
    const rh = await prisma.user.create({
      data: { email: 'rh.emp@test.com', password: pw, firstName: 'Rh', lastName: 'Emp', role: 'RH_RECRUITER', isActive: true },
    });
    const sales = await prisma.user.create({
      data: { email: 'sales.emp@test.com', password: pw, firstName: 'Sales', lastName: 'Emp', role: 'SALES', isActive: true },
    });
    // Vrai compte CLIENT : passport le résout via la table `clients`.
    const client = await prisma.client.create({
      data: { name: 'Client Test', email: 'client.emp@test.com', password: pw },
    });

    adminId = admin.id;
    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    rhToken = generateAccessToken({ userId: rh.id, email: rh.email!, role: rh.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });
    clientToken = generateAccessToken({ userId: client.id, email: client.email, role: 'CLIENT' });

    // Un employé actif visible + un employé soft-deleted (doit être exclu).
    const emp = await prisma.employee.create({
      data: { firstName: 'Jean', lastName: 'Tremblay', phone: '4385551234', city: 'Montréal', status: 'ACTIF' },
    });
    await prisma.employee.create({
      data: { firstName: 'Sup', lastName: 'Primé', phone: '4385559999', isDeleted: true, deletedAt: new Date() },
    });
    // Un brouillon de remise d'uniforme rattaché (indicateur draftIssuanceCount).
    await prisma.uniformIssuance.create({
      data: { employeeId: emp.id, status: 'DRAFT', division: 'SECURITE' },
    });
  });

  describe('garde auth / rôle', () => {
    it('sans token → 401', async () => {
      const res = await request(app).get('/api/employees');
      expect(res.status).toBe(401);
    });

    it('token CLIENT → 403 (réservé staff)', async () => {
      const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(403);
    });

    it('rôle lecture-seule (SALES) en écriture POST → 403', async () => {
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ firstName: 'No', lastName: 'Pe', phone: '4385550000' });
      expect(res.status).toBe(403);
    });

    it('SALES peut LIRE (GET) → 200', async () => {
      const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${salesToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GET / (getEmployees)', () => {
    it('ADMIN → liste paginée, exclut les supprimés, expose draftIssuanceCount', async () => {
      const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const names = res.body.data.map((e: any) => e.lastName);
      expect(names).toContain('Tremblay');
      expect(names).not.toContain('Primé'); // soft-deleted exclu
      expect(res.body.pagination.total).toBe(1);
      const jean = res.body.data.find((e: any) => e.lastName === 'Tremblay');
      expect(jean.draftIssuanceCount).toBe(1);
    });
  });

  describe('GET /:id (getEmployeeById)', () => {
    it('id UUID inexistant → 404', async () => {
      const res = await request(app)
        .get('/api/employees/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('id non-UUID → 400 (validation paramètre)', async () => {
      const res = await request(app)
        .get('/api/employees/pas-un-uuid')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('POST / (createEmployee)', () => {
    it('RH crée un employé → 201', async () => {
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ firstName: 'Marie', lastName: 'Gagnon', phone: '5145551111', city: 'Laval' });
      expect(res.status).toBe(201);
      expect(res.body.data.firstName).toBe('Marie');
      expect(res.body.data.id).toBeDefined();
    });

    it('contact déjà existant (téléphone) → 409', async () => {
      // Réutilise le téléphone de l'employé seedé Jean Tremblay.
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ firstName: 'Doublon', lastName: 'Phone', phone: '4385551234' });
      expect(res.status).toBe(409);
      expect(res.body.conflict).toBeDefined();
      expect(res.body.conflict.section).toBe('employee');
    });
  });

  describe('POST /promote/:candidateId (promoteCandidateToEmployee)', () => {
    it('candidat inexistant → 404', async () => {
      const res = await request(app)
        .post('/api/employees/promote/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({});
      expect(res.status).toBe(404);
    });

    it('promeut un candidat → 201 et soft-delete le candidat', async () => {
      const candidate = await prisma.candidate.create({
        data: { firstName: 'Luc', lastName: 'Bélanger', phone: '4505552222', city: 'Brossard', email: 'luc.b@test.com', createdById: adminId },
      });
      const res = await request(app)
        .post(`/api/employees/promote/${candidate.id}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ position: 'Agent', assignment: 'Magellan Brossard' });

      expect(res.status).toBe(201);
      expect(res.body.data.firstName).toBe('Luc');
      expect(res.body.data.status).toBe('ACTIF');
      expect(res.body.data.convertedFromCandidateId).toBe(candidate.id);

      // Le candidat sort de la liste Candidats (soft-delete).
      const after = await prisma.candidate.findUnique({ where: { id: candidate.id } });
      expect(after?.isDeleted).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /:id — offboarding uniformes (transition de statut)
  // -------------------------------------------------------------------------
  describe('PUT /:id — offboarding uniformes', () => {
    // Crée un employé ACTIF détenant `qty` pièces via une remise ISSUED écrite
    // directement en base (on évite le controller PDF/SMS). `dueReturnAt`=null
    // par défaut pour tester la propagation de l'échéance.
    async function seedHolder(phone: string, qty = 2, dueReturnAt: Date | null = null) {
      const emp = await prisma.employee.create({
        data: { firstName: 'Fin', lastName: 'Emploi', phone, status: 'ACTIF' },
      });
      const item = await prisma.uniformItem.create({
        data: { division: 'SECURITE', name: `Chemise ${phone}`, defaultReplacementCost: 30 },
      });
      const variant = await prisma.uniformVariant.create({
        data: { itemId: item.id, size: 'M', barcode: `OFF-${phone}`, replacementCost: 30 },
      });
      const iss = await prisma.uniformIssuance.create({
        data: {
          employeeId: emp.id, division: 'SECURITE', status: 'ISSUED', dueReturnAt,
          lines: { create: [{ variantId: variant.id, quantity: qty, unitCostSnapshot: 30 }] },
        },
      });
      return { emp, variant, iss };
    }

    it('ACTIF→INACTIF avec uniformes : pose terminationDate + échéance, propage dueReturnAt, renvoie uniformWarning', async () => {
      const { emp, iss } = await seedHolder('5145558801', 2, null);
      const res = await request(app)
        .put(`/api/employees/${emp.id}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'INACTIF' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('INACTIF');
      expect(res.body.data.terminationDate).toBeTruthy();
      expect(res.body.data.uniformReturnDeadlineAt).toBeTruthy();
      expect(res.body.uniformWarning).toBeDefined();
      expect(res.body.uniformWarning.totalPieces).toBe(2);
      expect(res.body.uniformWarning.activeIssuanceIds).toContain(iss.id);

      // dueReturnAt propagé sur la remise qui n'en avait pas.
      const after = await prisma.uniformIssuance.findUnique({ where: { id: iss.id } });
      expect(after?.dueReturnAt).toBeTruthy();
    });

    it('ACTIF→INACTIF sans uniformes : pas de uniformWarning mais échéance posée', async () => {
      const emp = await prisma.employee.create({
        data: { firstName: 'Sans', lastName: 'Uniforme', phone: '5145558802', status: 'ACTIF' },
      });
      const res = await request(app)
        .put(`/api/employees/${emp.id}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'INACTIF' });
      expect(res.status).toBe(200);
      expect(res.body.uniformWarning).toBeUndefined();
      expect(res.body.data.uniformReturnDeadlineAt).toBeTruthy();
    });

    it('ne propage PAS dueReturnAt si la remise en possède déjà une', async () => {
      const fixed = new Date('2099-01-15T12:00:00.000Z');
      const { emp, iss } = await seedHolder('5145558803', 1, fixed);
      await request(app)
        .put(`/api/employees/${emp.id}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'INACTIF' });
      const after = await prisma.uniformIssuance.findUnique({ where: { id: iss.id } });
      expect(after?.dueReturnAt?.toISOString()).toBe(fixed.toISOString());
    });

    it('réactivation INACTIF→ACTIF : efface terminationDate + échéance', async () => {
      const emp = await prisma.employee.create({
        data: {
          firstName: 'Re', lastName: 'Actif', phone: '5145558804', status: 'INACTIF',
          terminationDate: new Date(), uniformReturnDeadlineAt: new Date(),
        },
      });
      const res = await request(app)
        .put(`/api/employees/${emp.id}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'ACTIF' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ACTIF');
      expect(res.body.data.terminationDate).toBeNull();
      expect(res.body.data.uniformReturnDeadlineAt).toBeNull();
    });

    it('aller-retour ACTIF→INACTIF→ACTIF : la date butoir propagée est annulée à la réembauche', async () => {
      const { emp, iss } = await seedHolder('5145558805', 2, null);
      // 1) Fin d'emploi → dueReturnAt propagé sur la remise (était null).
      await request(app).put(`/api/employees/${emp.id}`).set('Authorization', `Bearer ${rhToken}`).send({ status: 'INACTIF' });
      const inactive = await prisma.uniformIssuance.findUnique({ where: { id: iss.id } });
      expect(inactive?.dueReturnAt).toBeTruthy();
      // 2) Réembauche → la date butoir propagée doit être annulée (pas d'alerte de retard).
      await request(app).put(`/api/employees/${emp.id}`).set('Authorization', `Bearer ${rhToken}`).send({ status: 'ACTIF' });
      const reactivated = await prisma.uniformIssuance.findUnique({ where: { id: iss.id } });
      expect(reactivated?.dueReturnAt).toBeNull();
    });

    it('réembauche : une date butoir fixée manuellement (≠ échéance) est PRÉSERVÉE', async () => {
      const manual = new Date('2099-03-03T12:00:00.000Z');
      const { emp, iss } = await seedHolder('5145558806', 1, manual);
      await request(app).put(`/api/employees/${emp.id}`).set('Authorization', `Bearer ${rhToken}`).send({ status: 'INACTIF' });
      await request(app).put(`/api/employees/${emp.id}`).set('Authorization', `Bearer ${rhToken}`).send({ status: 'ACTIF' });
      const after = await prisma.uniformIssuance.findUnique({ where: { id: iss.id } });
      expect(after?.dueReturnAt?.toISOString()).toBe(manual.toISOString());
    });
  });
});
