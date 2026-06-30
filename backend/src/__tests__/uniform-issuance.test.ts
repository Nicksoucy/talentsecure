import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Remises d'uniforme — /api/uniforms/issuances (uniform-issuance.controller).
 *
 * Routage (src/routes/uniform.routes.ts, monté sur /api/uniforms via app.ts) :
 *   - router.use(authenticateJWT)            → 401 sans token
 *   - puis authorizeReadWrite(read, write)   → CLIENT 403 ; MAGASIN lecture seule
 *       read  = ADMIN, RH_RECRUITER, MAGASIN, MAGASIN_GESTION
 *       write = ADMIN, RH_RECRUITER, MAGASIN_GESTION   (MAGASIN exclu en écriture)
 *
 * On couvre la priorité auth (401/403), la validation (400), le 404 (employé /
 * remise introuvable), puis des chemins heureux RÉALISTES qui exercent les FK
 * profondes du sous-système : création d'un brouillon avec ligne de variante,
 * finalisation (décrément du stock OUT via uniform-stock.service.applyMovement),
 * refus de re-finalisation (400), et annulation qui ré-incrémente le stock (IN).
 *
 * SEED FK (ordre) : UniformItem(division) → UniformVariant(barcode unique) →
 * stock initial (replenish IN via mouvement direct) → Employee → UniformIssuance.
 * Le lien issuance.employeeId est un lien lâche (pas de FK Prisma) mais le
 * controller VÉRIFIE l'existence de l'employé (404 sinon), donc on le seede.
 *
 * SERVICES EXTERNES mockés (le controller les importe au chargement du module) :
 * R2, PDF, SMS, notification. Aucun n'est requis pour la logique testée ici
 * (création / finalisation / annulation) ; on garantit zéro réseau réel et on
 * évite que le PDF best-effort de finalize ne pollue les logs.
 *
 * PIÈGE token CLIENT : passport le résout via la table `clients`, pas `users`.
 * On signe donc sur un VRAI prisma.client.create, sinon passport renvoie 401
 * (client introuvable) et le test mentirait sur la cause du rejet (on veut 403).
 */

jest.mock('../services/r2.service', () => ({
  useR2: false,
  uploadBufferToR2: jest.fn().mockResolvedValue({ key: 'mock/key.pdf' }),
  getSignedFileUrl: jest.fn().mockResolvedValue('https://mock.example/signed'),
}));
jest.mock('../services/uniform-pdf.service', () => ({
  generateIssuancePdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
}));
jest.mock('../services/sms.service', () => ({
  sendSignatureSms: jest.fn().mockResolvedValue({ messageId: 'mock-msg' }),
}));
jest.mock('../services/notification.service', () => ({
  notify: jest.fn().mockResolvedValue([]),
}));

describe("Remises d'uniforme — /api/uniforms/issuances", () => {
  let app: Express;

  let adminToken: string;
  let magasinToken: string; // lecture seule (exclu en écriture)
  let clientToken: string;

  let employeeId: string;
  let variantId: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.iss@test.com', password: pw, firstName: 'Admin', lastName: 'Iss', role: 'ADMIN', isActive: true },
    });
    const magasin = await prisma.user.create({
      data: { email: 'magasin.iss@test.com', password: pw, firstName: 'Maga', lastName: 'Sin', role: 'MAGASIN', isActive: true },
    });
    // Vrai compte CLIENT (résolu par passport via la table `clients`).
    const clientAccount = await prisma.client.create({
      data: { name: 'Portail Iss', email: 'portail.iss@client.com', password: pw, isActive: true },
    });

    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    magasinToken = generateAccessToken({ userId: magasin.id, email: magasin.email!, role: magasin.role });
    clientToken = generateAccessToken({ userId: clientAccount.id, email: clientAccount.email, role: 'CLIENT' });

    // Agent destinataire de la remise (le controller exige son existence → 404 sinon).
    const employee = await prisma.employee.create({
      data: { firstName: 'Pierre', lastName: 'Lavoie', phone: '4385557777', city: 'Montréal', status: 'ACTIF' },
    });
    employeeId = employee.id;

    // Article + variante (FK : variant.itemId → item.id). barcode est unique.
    const item = await prisma.uniformItem.create({
      data: { division: 'SECURITE', name: 'Chemise blanche', defaultReplacementCost: 25 },
    });
    const variant = await prisma.uniformVariant.create({
      data: { itemId: item.id, size: 'M', barcode: 'TST-ISS-0001', replacementCost: 25 },
    });
    variantId = variant.id;

    // Stock initial à FRONT_OFFICE (défaut de remise) : 10 unités, via le bucket
    // d'emplacement + le cache total, pour que la finalisation (OUT) ait du stock.
    await prisma.uniformVariantStock.create({
      data: { variantId: variant.id, location: 'FRONT_OFFICE', quantityOnHand: 10 },
    });
    await prisma.uniformVariant.update({ where: { id: variant.id }, data: { quantityOnHand: 10 } });
  });

  // -------------------------------------------------------------------------
  // Priorité auth / rôle
  // -------------------------------------------------------------------------
  describe('garde auth / rôle', () => {
    it('sans token → 401', async () => {
      const res = await request(app).get('/api/uniforms/issuances');
      expect(res.status).toBe(401);
    });

    it('token CLIENT → 403 (back-office interdit aux comptes portail)', async () => {
      const res = await request(app)
        .get('/api/uniforms/issuances')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(403);
    });

    it('MAGASIN (lecture seule) peut LIRE la liste → 200', async () => {
      const res = await request(app)
        .get('/api/uniforms/issuances')
        .set('Authorization', `Bearer ${magasinToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('MAGASIN (lecture seule) ne peut PAS finaliser (écriture) → 403', async () => {
      const res = await request(app)
        .post('/api/uniforms/issuances/00000000-0000-0000-0000-000000000000/finalize')
        .set('Authorization', `Bearer ${magasinToken}`)
        .send({});
      // Le write-gate doit rejeter AVANT d'atteindre le controller (pas de 404).
      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Validation & 404 (createIssuance)
  // -------------------------------------------------------------------------
  describe('POST /issuances (createIssuance)', () => {
    it('division manquante → 400', async () => {
      const res = await request(app)
        .post('/api/uniforms/issuances')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ employeeId });
      expect(res.status).toBe(400);
      // Validation au bord (P2-A) : 400 ERREUR_VALIDATION, le champ manquant
      // est détaillé dans `details` (le `message` top-level est générique).
      expect(res.body.code).toBe('ERREUR_VALIDATION');
      expect(JSON.stringify(res.body.details)).toMatch(/division/i);
    });

    it('employeeId inexistant → 404 (agent introuvable)', async () => {
      const res = await request(app)
        .post('/api/uniforms/issuances')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ employeeId: '00000000-0000-0000-0000-000000000000', division: 'SECURITE' });
      expect(res.status).toBe(404);
    });

    it('ADMIN crée un brouillon avec une ligne de variante → 201 (DRAFT, ligne persistée)', async () => {
      const res = await request(app)
        .post('/api/uniforms/issuances')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId,
          division: 'SECURITE',
          lines: [{ variantId, quantity: 2 }],
        });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.lines).toHaveLength(1);
      expect(res.body.data.lines[0].variantId).toBe(variantId);
      expect(res.body.data.lines[0].quantity).toBe(2);
      // Snapshot du coût = replacementCost de la variante (25.00).
      expect(Number(res.body.data.lines[0].unitCostSnapshot)).toBe(25);

      // Vérifie en base que la ligne est bien rattachée (FK issuanceId).
      const lines = await prisma.uniformIssuanceLine.findMany({ where: { issuanceId: res.body.data.id } });
      expect(lines).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Chemin heureux : finalisation (décrément stock) + garde de re-finalisation
  // -------------------------------------------------------------------------
  describe('POST /issuances/:id/finalize (finalizeIssuance)', () => {
    it('finalise un brouillon → 200, ISSUED, stock décrémenté (mouvement OUT)', async () => {
      // Brouillon dédié de 3 unités.
      const draft = await prisma.uniformIssuance.create({
        data: {
          employeeId,
          division: 'SECURITE',
          status: 'DRAFT',
          sourceLocation: 'FRONT_OFFICE',
          lines: { create: [{ variantId, quantity: 3, unitCostSnapshot: 25 }] },
        },
      });

      const before = await prisma.uniformVariant.findUnique({ where: { id: variantId } });

      const res = await request(app)
        .post(`/api/uniforms/issuances/${draft.id}/finalize`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ISSUED');
      expect(Number(res.body.data.totalLoanCost)).toBe(75); // 3 × 25

      // Stock total décrémenté de 3.
      const after = await prisma.uniformVariant.findUnique({ where: { id: variantId } });
      expect(after!.quantityOnHand).toBe(before!.quantityOnHand - 3);

      // Mouvement OUT auditable créé, rattaché à la remise.
      const movement = await prisma.uniformStockMovement.findFirst({
        where: { issuanceId: draft.id, type: 'OUT' },
      });
      expect(movement).not.toBeNull();
      expect(movement!.quantity).toBe(-3); // delta signé
      expect(movement!.location).toBe('FRONT_OFFICE');
    });

    it('finalise une remise DÉJÀ finalisée → 400', async () => {
      const issued = await prisma.uniformIssuance.create({
        data: { employeeId, division: 'SECURITE', status: 'ISSUED' },
      });
      const res = await request(app)
        .post(`/api/uniforms/issuances/${issued.id}/finalize`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/finalis/i);
    });

    it('finalise une remise SANS pièce → 400', async () => {
      const empty = await prisma.uniformIssuance.create({
        data: { employeeId, division: 'SECURITE', status: 'DRAFT' },
      });
      const res = await request(app)
        .post(`/api/uniforms/issuances/${empty.id}/finalize`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('remise introuvable → 404', async () => {
      const res = await request(app)
        .post('/api/uniforms/issuances/11111111-1111-1111-1111-111111111111/finalize')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Chemin heureux : annulation après finalisation → ré-incrémente le stock
  // -------------------------------------------------------------------------
  describe('POST /issuances/:id/cancel (cancelIssuance)', () => {
    it('annule une remise finalisée → 200, CANCELLED, stock ré-incrémenté (mouvement IN)', async () => {
      // On crée et finalise une remise de 2 unités via l'API (chaîne réaliste).
      const createRes = await request(app)
        .post('/api/uniforms/issuances')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ employeeId, division: 'SECURITE', lines: [{ variantId, quantity: 2 }] });
      expect(createRes.status).toBe(201);
      const issuanceId = createRes.body.data.id;

      const finalizeRes = await request(app)
        .post(`/api/uniforms/issuances/${issuanceId}/finalize`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(finalizeRes.status).toBe(200);

      const afterFinalize = await prisma.uniformVariant.findUnique({ where: { id: variantId } });

      const cancelRes = await request(app)
        .post(`/api/uniforms/issuances/${issuanceId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('CANCELLED');

      // Le stock retiré (2) est ré-injecté → on revient au niveau d'avant annulation +2.
      const afterCancel = await prisma.uniformVariant.findUnique({ where: { id: variantId } });
      expect(afterCancel!.quantityOnHand).toBe(afterFinalize!.quantityOnHand + 2);

      // Mouvement IN inverse créé pour l'annulation.
      const inMovement = await prisma.uniformStockMovement.findFirst({
        where: { issuanceId, type: 'IN' },
      });
      expect(inMovement).not.toBeNull();
      expect(inMovement!.quantity).toBe(2); // delta signé positif
    });

    it('annuler une remise déjà annulée → 400', async () => {
      const cancelled = await prisma.uniformIssuance.create({
        data: { employeeId, division: 'SECURITE', status: 'CANCELLED' },
      });
      const res = await request(app)
        .post(`/api/uniforms/issuances/${cancelled.id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });
});
