import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Retours d'uniforme — sous-routeur /api/uniforms/returns/* + holdings.
 * Controller : src/controllers/uniform-return.controller.ts
 * Montage    : app.use('/api/uniforms', uniformRoutes) → router.post('/returns', ...)
 *
 * Gardes (cf. uniform.routes.ts) :
 *   router.use(authenticateJWT)               → 401 sans token
 *   router.use(authorizeReadWrite(
 *     read : [ADMIN, RH_RECRUITER, MAGASIN, MAGASIN_GESTION],
 *     write: [ADMIN, RH_RECRUITER, MAGASIN_GESTION],   // MAGASIN = lecture seule
 *   ))
 * Un token role:'CLIENT' n'est PAS dans readRoles/writeRoles → 403 sur toutes
 * les routes. (Passport le résout via la table `clients` ; on signe donc le
 * token sur un VRAI prisma.client.create, sinon passport renverrait 401 et le
 * test mentirait sur la raison du rejet.)
 *
 * Couverture :
 *  - Auth : 401 (sans token), 403 (CLIENT), 403 (MAGASIN lecture-seule en POST)
 *  - Validation : 400 (issuanceId manquant), 400 (aucune ligne à retourner)
 *  - 404 : remise parente introuvable (createReturn), retour introuvable (getReturn)
 *  - Chemins heureux RÉALISTES :
 *      * createReturn → brouillon 201 avec lignes
 *      * finalizeReturn → 201/200 : triage GOOD (→ lot lavage + mouvements stock)
 *        + DAMAGED + LOST ; recalcul du statut de la remise parente ; dette figée.
 *
 * Services externes neutralisés (le controller les importe au chargement et
 * certains chemins les appellent réellement) : R2 (upload/url), PDF retour,
 * SMS, upload de signature, notifications. On vérifie le COMPORTEMENT MÉTIER
 * (stock, statuts, lignes), pas ces effets de bord réseau.
 */

jest.mock('../services/r2.service', () => ({
  useR2: false,
  uploadBufferToR2: jest.fn().mockResolvedValue({ key: 'forms/returns/mock.pdf' }),
  getSignedFileUrl: jest.fn().mockResolvedValue('https://signed.example/mock.pdf'),
}));
jest.mock('../services/uniform-pdf.service', () => ({
  generateReturnPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-mock')),
  generateIssuancePdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-mock')),
}));
jest.mock('../services/sms.service', () => ({
  sendSignatureSms: jest.fn().mockResolvedValue({ messageId: 'mock-msg-id' }),
}));
jest.mock('../utils/signature', () => ({
  uploadSignaturePng: jest.fn().mockResolvedValue('signatures/returns/mock.png'),
}));
jest.mock('../services/notification.service', () => ({
  notify: jest.fn().mockResolvedValue([]),
}));

describe('Uniformes — retours /api/uniforms/returns', () => {
  let app: Express;
  let adminToken: string;
  let magasinToken: string;
  let clientToken: string;

  // Entités seedées (chaîne FK : Item → Variant → Employee → Issuance → Lines).
  let employeeId: string;
  let variantId: string; // taille S — utilisée pour GOOD
  let variantDamagedId: string; // taille M — utilisée pour DAMAGED
  let issuanceId: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.ureturn@test.com', password: pw, firstName: 'Admin', lastName: 'UR', role: 'ADMIN', isActive: true },
    });
    const magasin = await prisma.user.create({
      data: { email: 'magasin.ureturn@test.com', password: pw, firstName: 'Mag', lastName: 'UR', role: 'MAGASIN', isActive: true },
    });
    // Vrai compte CLIENT : passport le résout via la table `clients`.
    const client = await prisma.client.create({
      data: { name: 'Client UR', email: 'client.ureturn@test.com', password: pw },
    });

    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    magasinToken = generateAccessToken({ userId: magasin.id, email: magasin.email!, role: magasin.role });
    clientToken = generateAccessToken({ userId: client.id, email: client.email, role: 'CLIENT' });

    const employee = await prisma.employee.create({
      data: { firstName: 'Agent', lastName: 'Retour', phone: '5145550000', city: 'Montréal', status: 'ACTIF' },
    });
    employeeId = employee.id;

    // Catalogue : 1 morceau (division SECURITE) + 2 variantes (S, M).
    const item = await prisma.uniformItem.create({
      data: { division: 'SECURITE', type: 'UNIFORME', name: 'Chemise', defaultReplacementCost: 25 },
    });
    const variantGood = await prisma.uniformVariant.create({
      data: { itemId: item.id, size: 'S', barcode: 'UR-CHEMISE-S', replacementCost: 25, quantityOnHand: 0 },
    });
    const variantDamaged = await prisma.uniformVariant.create({
      data: { itemId: item.id, size: 'M', barcode: 'UR-CHEMISE-M', replacementCost: 30, quantityOnHand: 0 },
    });
    variantId = variantGood.id;
    variantDamagedId = variantDamaged.id;

    // Remise (ISSUED) : 2 chemises S, 1 chemise M, 1 ligne "Autre" (sans variante).
    const issuance = await prisma.uniformIssuance.create({
      data: {
        employeeId,
        division: 'SECURITE',
        status: 'ISSUED',
        issuedAt: new Date(),
        lines: {
          create: [
            { variantId: variantGood.id, quantity: 2, unitCostSnapshot: 25 },
            { variantId: variantDamaged.id, quantity: 1, unitCostSnapshot: 30 },
            { customItemName: 'Badge', quantity: 1, unitCostSnapshot: 0 },
          ],
        },
      },
    });
    issuanceId = issuance.id;
  });

  // -----------------------------------------------------------------------
  // Gardes auth / rôle
  // -----------------------------------------------------------------------
  describe('garde auth / rôle', () => {
    it('sans token → 401', async () => {
      const res = await request(app).post('/api/uniforms/returns').send({ issuanceId });
      expect(res.status).toBe(401);
    });

    it('token CLIENT → 403 (réservé staff)', async () => {
      const res = await request(app)
        .post('/api/uniforms/returns')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ issuanceId });
      expect(res.status).toBe(403);
    });

    it('MAGASIN (lecture seule) en écriture POST → 403', async () => {
      const res = await request(app)
        .post('/api/uniforms/returns')
        .set('Authorization', `Bearer ${magasinToken}`)
        .send({ issuanceId, lines: [{ variantId, quantity: 1, condition: 'GOOD' }] });
      expect(res.status).toBe(403);
    });

    it('MAGASIN peut LIRE (GET holdings) → 200', async () => {
      const res = await request(app)
        .get(`/api/uniforms/employees/${employeeId}/holdings`)
        .set('Authorization', `Bearer ${magasinToken}`);
      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // createReturn — validation & 404
  // -----------------------------------------------------------------------
  describe('POST /returns (createReturn)', () => {
    it('issuanceId manquant → 400', async () => {
      const res = await request(app)
        .post('/api/uniforms/returns')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ lines: [{ variantId, quantity: 1, condition: 'GOOD' }] });
      expect(res.status).toBe(400);
    });

    it('remise parente introuvable → 404', async () => {
      const res = await request(app)
        .post('/api/uniforms/returns')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ issuanceId: '00000000-0000-0000-0000-000000000000', lines: [{ variantId, quantity: 1, condition: 'GOOD' }] });
      expect(res.status).toBe(404);
    });

    it('aucune ligne valide (qty=0) → 400', async () => {
      const res = await request(app)
        .post('/api/uniforms/returns')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ issuanceId, lines: [{ variantId, quantity: 0, condition: 'GOOD' }] });
      expect(res.status).toBe(400);
    });

    it('crée un brouillon de retour avec lignes → 201', async () => {
      const res = await request(app)
        .post('/api/uniforms/returns')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          issuanceId,
          notes: 'Retour test',
          lines: [{ variantId, quantity: 1, condition: 'GOOD' }],
        });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.issuanceId).toBe(issuanceId);
      // employeeId est dénormalisé depuis la remise parente.
      expect(res.body.data.employeeId).toBe(employeeId);
      expect(res.body.data.lines).toHaveLength(1);
      // unitReplacementCost hérite du coût de la variante (25) quand non fourni.
      expect(Number(res.body.data.lines[0].unitReplacementCost)).toBe(25);
    });
  });

  // -----------------------------------------------------------------------
  // getReturn — 404
  // -----------------------------------------------------------------------
  describe('GET /returns/:id (getReturn)', () => {
    it('retour introuvable → 404', async () => {
      const res = await request(app)
        .get('/api/uniforms/returns/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('retour existant → 200 avec employé joint', async () => {
      // Crée un brouillon dédié à lire.
      const created = await prisma.uniformReturn.create({
        data: {
          issuanceId,
          employeeId,
          lines: { create: [{ variantId, quantity: 1, condition: 'GOOD', unitReplacementCost: 25 }] },
        },
      });
      const res = await request(app)
        .get(`/api/uniforms/returns/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(created.id);
      // Le controller joint l'employé (jointure explicite, pas de FK Prisma).
      expect(res.body.data.employee.id).toBe(employeeId);
      expect(res.body.data.employee.lastName).toBe('Retour');
    });
  });

  // -----------------------------------------------------------------------
  // finalizeReturn — chemin heureux complet + garde DRAFT
  // -----------------------------------------------------------------------
  describe('POST /returns/:id/finalize (finalizeReturn)', () => {
    it('retour introuvable → 404', async () => {
      const res = await request(app)
        .post('/api/uniforms/returns/00000000-0000-0000-0000-000000000000/finalize')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('triage GOOD + DAMAGED + LOST : statut remise, stock, lot de lavage, dette', async () => {
      // Remise dédiée à CE test (isole le recalcul de statut parent) :
      //   2× S (GOOD), 1× M (DAMAGED), + on retournera 1× S perdu (LOST).
      const issuance = await prisma.uniformIssuance.create({
        data: {
          employeeId,
          division: 'SECURITE',
          status: 'ISSUED',
          issuedAt: new Date(),
          lines: {
            create: [
              { variantId, quantity: 3, unitCostSnapshot: 25 }, // 3 S prêtées
              { variantId: variantDamagedId, quantity: 1, unitCostSnapshot: 30 }, // 1 M prêtée
            ],
          },
        },
      });

      // Brouillon de retour : 2 S GOOD, 1 S LOST (3 S au total → S soldée),
      // 1 M DAMAGED → tout retourné ⇒ statut parent attendu = RETURNED.
      const ret = await prisma.uniformReturn.create({
        data: {
          issuanceId: issuance.id,
          employeeId,
          lines: {
            create: [
              { variantId, quantity: 2, condition: 'GOOD', unitReplacementCost: 25 },
              { variantId, quantity: 1, condition: 'LOST', unitReplacementCost: 25 },
              { variantId: variantDamagedId, quantity: 1, condition: 'DAMAGED', unitReplacementCost: 30 },
            ],
          },
        },
      });

      const res = await request(app)
        .post(`/api/uniforms/returns/${ret.id}/finalize`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RETURNED');
      expect(res.body.data.goodCount).toBe(2);
      expect(res.body.data.damagedCount).toBe(1);
      expect(res.body.data.lostCount).toBe(1);
      // Au moins une pièce GOOD ⇒ un lot de lavage a été créé/ouvert.
      expect(res.body.data.washBatchId).toBeTruthy();

      // Le retour est persistant en RETURNED avec returnedAt.
      const persisted = await prisma.uniformReturn.findUnique({ where: { id: ret.id } });
      expect(persisted?.status).toBe('RETURNED');
      expect(persisted?.returnedAt).toBeTruthy();

      // La remise parente est recalculée : tout est revenu ⇒ RETURNED.
      const parent = await prisma.uniformIssuance.findUnique({ where: { id: issuance.id } });
      expect(parent?.status).toBe('RETURNED');

      // Lot de lavage : 2 items qty=1 (granularité par pièce) pour les 2 S GOOD.
      const washItems = await prisma.uniformWashBatchItem.findMany({
        where: { batchId: res.body.data.washBatchId },
      });
      expect(washItems).toHaveLength(2);
      expect(washItems.every((i) => i.variantId === variantId && i.quantity === 1)).toBe(true);

      // Mouvements de stock pour la variante GOOD (S) : IN (+2) puis WASH_IN (-2).
      // Net 0 sur quantityOnHand (réintégration physique puis mise en lavage).
      const goodVariant = await prisma.uniformVariant.findUnique({ where: { id: variantId } });
      expect(goodVariant?.quantityOnHand).toBe(0);
      const goodMovements = await prisma.uniformStockMovement.findMany({
        where: { variantId, returnId: ret.id },
      });
      const types = goodMovements.map((m) => m.type).sort();
      expect(types).toEqual(['IN', 'WASH_IN']);

      // Variante DAMAGED (M), partie d'un cache à 0 : IN (delta +1, réintégration
      // physique de la pièce rapportée) puis DAMAGED (delta -1, rebut). Les deux
      // deltas s'annulent ⇒ quantityOnHand revient à 0 (la pièce est entrée puis
      // partie au rebut). Ce qui « tue » la pièce est le couple de mouvements, pas
      // un solde négatif. On verrouille donc les deltas du registre auditable.
      const damagedVariant = await prisma.uniformVariant.findUnique({ where: { id: variantDamagedId } });
      expect(damagedVariant?.quantityOnHand).toBe(0);
      const damagedMovements = await prisma.uniformStockMovement.findMany({
        where: { variantId: variantDamagedId, returnId: ret.id },
      });
      // Deux mouvements : IN (delta +1) + DAMAGED (delta -1). On compare sans
      // dépendre de l'ordre d'insertion ni de l'ordre de l'enum Postgres.
      expect([...damagedMovements.map((m) => m.type)].sort()).toEqual(['DAMAGED', 'IN']);
      expect(damagedMovements.find((m) => m.type === 'IN')?.quantity).toBe(1);
      expect(damagedMovements.find((m) => m.type === 'DAMAGED')?.quantity).toBe(-1);

      // LOST : AUCUN mouvement de stock (la pièce était déjà sortie à la remise) ;
      // la dette est figée par unitReplacementCost sur la ligne de retour.
      const lostLine = res.body.data.lines.find(
        (l: { condition: string }) => l.condition === 'LOST',
      );
      expect(lostLine).toBeDefined();
      expect(Number(lostLine.unitReplacementCost)).toBe(25);
      // Le registre de mouvements ne contient QUE les 4 deltas attendus pour ce
      // retour (GOOD: IN+WASH_IN, DAMAGED: IN+DAMAGED) — rien pour la pièce LOST.
      const allMovementsForReturn = await prisma.uniformStockMovement.findMany({
        where: { returnId: ret.id },
      });
      expect(allMovementsForReturn).toHaveLength(4);
      expect([...allMovementsForReturn.map((m) => m.type)].sort()).toEqual(
        ['DAMAGED', 'IN', 'IN', 'WASH_IN'],
      );

      // Le GET holdings reste fonctionnel et n'expose jamais de quantité négative.
      const holdingsRes = await request(app)
        .get(`/api/uniforms/employees/${employeeId}/holdings`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(holdingsRes.status).toBe(200);
      expect(
        (holdingsRes.body.data as Array<{ quantity: number }>).every((h) => h.quantity > 0),
      ).toBe(true);
    });

    it('retour déjà finalisé → 400', async () => {
      // Brouillon → finalize (200) → re-finalize (400 : status != DRAFT).
      const issuance = await prisma.uniformIssuance.create({
        data: {
          employeeId,
          division: 'SECURITE',
          status: 'ISSUED',
          issuedAt: new Date(),
          lines: { create: [{ variantId, quantity: 1, unitCostSnapshot: 25 }] },
        },
      });
      const ret = await prisma.uniformReturn.create({
        data: {
          issuanceId: issuance.id,
          employeeId,
          lines: { create: [{ variantId, quantity: 1, condition: 'GOOD', unitReplacementCost: 25 }] },
        },
      });
      const first = await request(app)
        .post(`/api/uniforms/returns/${ret.id}/finalize`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(first.status).toBe(200);

      const second = await request(app)
        .post(`/api/uniforms/returns/${ret.id}/finalize`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(second.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // Retour tardif — remise CLOSED_TERMINATION (pièces rapportées après clôture)
  // -----------------------------------------------------------------------
  describe('retour tardif (remise CLOSED_TERMINATION)', () => {
    // Employé dédié : isole la dette (computeAmountOwed) des autres tests.
    let lateEmployeeId: string;
    let lateIssuanceId: string;

    beforeAll(async () => {
      const emp = await prisma.employee.create({
        data: { firstName: 'Ancien', lastName: 'Tardif', phone: '5145550001', city: 'Montréal', status: 'INACTIF' },
      });
      lateEmployeeId = emp.id;

      // Remise clôturée fin d'emploi : 2 S dehors, facturées NOT_RETURNED à 25 $
      // (dette figée = 50 $), comme le ferait closeTerminationCore.
      const issuance = await prisma.uniformIssuance.create({
        data: {
          employeeId: lateEmployeeId,
          division: 'SECURITE',
          status: 'CLOSED_TERMINATION',
          issuedAt: new Date(),
          lines: { create: [{ variantId, quantity: 2, unitCostSnapshot: 25 }] },
        },
      });
      lateIssuanceId = issuance.id;
      await prisma.uniformReturn.create({
        data: {
          issuanceId: issuance.id,
          employeeId: lateEmployeeId,
          status: 'RETURNED',
          returnedAt: new Date(),
          notes: 'Clôture fin d’emploi — pièces non retournées',
          lines: { create: [{ variantId, quantity: 2, condition: 'NOT_RETURNED', unitReplacementCost: 25 }] },
        },
      });
    });

    it('createReturn sur remise clôturée → isLateReturn=true et coûts de ligne forcés à 0', async () => {
      const res = await request(app)
        .post('/api/uniforms/returns')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ issuanceId: lateIssuanceId, lines: [{ variantId, quantity: 1, condition: 'GOOD', unitReplacementCost: 25 }] });
      expect(res.status).toBe(201);
      expect(res.body.data.isLateReturn).toBe(true);
      // Coût 0 : la dette est déjà figée par les lignes NOT_RETURNED de la
      // clôture — sinon computeAmountOwed facturerait une 2ᵉ fois.
      expect(Number(res.body.data.lines[0].unitReplacementCost)).toBe(0);
      // Nettoyage : ce brouillon ne doit pas polluer le test de finalisation.
      await prisma.uniformReturn.delete({ where: { id: res.body.data.id } });
    });

    it('finalize : crédit de dette pour GOOD, rien pour DAMAGED, remise reste clôturée', async () => {
      // Dette figée avant : 2 × 25 = 50 $. Retour tardif : 1 GOOD + 1 DAMAGED.
      const created = await request(app)
        .post('/api/uniforms/returns')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          issuanceId: lateIssuanceId,
          lines: [
            { variantId, quantity: 1, condition: 'GOOD' },
            { variantId, quantity: 1, condition: 'DAMAGED' },
          ],
        });
      expect(created.status).toBe(201);

      const res = await request(app)
        .post(`/api/uniforms/returns/${created.body.data.id}/finalize`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/tardif/i);
      // Seule la pièce GOOD crédite, au coût facturé à la clôture (25 $).
      expect(Number(res.body.data.settledAmount)).toBe(25);

      // Règlement automatique créé, méthode dédiée.
      const settlements = await prisma.uniformDebtSettlement.findMany({
        where: { employeeId: lateEmployeeId },
      });
      expect(settlements).toHaveLength(1);
      expect(Number(settlements[0].amount)).toBe(25);
      expect(settlements[0].method).toBe('RETOUR TARDIF');

      // La dette FACTURÉE reste 50 $ (la ligne DAMAGED du retour tardif est à
      // 0 $ — pas de double facturation) ; solde = 50 − 25 = 25 $.
      const lines = await prisma.uniformReturnLine.findMany({
        where: { return: { employeeId: lateEmployeeId, status: 'RETURNED' } },
      });
      const charged = lines
        .filter((l) => ['DAMAGED', 'LOST', 'NOT_RETURNED'].includes(l.condition))
        .reduce((s, l) => s + l.quantity * Number(l.unitReplacementCost), 0);
      expect(charged).toBe(50);

      // La remise reste CLOSED_TERMINATION (refreshParentStatus la saute).
      const parent = await prisma.uniformIssuance.findUnique({ where: { id: lateIssuanceId } });
      expect(parent?.status).toBe('CLOSED_TERMINATION');

      // Mouvements de stock du retour tardif : GOOD → IN + WASH_IN ;
      // DAMAGED → IN + DAMAGED. Net 0 sur quantityOnHand.
      const movements = await prisma.uniformStockMovement.findMany({
        where: { returnId: created.body.data.id },
      });
      expect([...movements.map((m) => m.type)].sort()).toEqual(['DAMAGED', 'IN', 'IN', 'WASH_IN']);
    });
  });
});
