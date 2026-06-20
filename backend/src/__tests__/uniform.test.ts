import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { generateAccessToken } from '../utils/jwt';
import { hashPassword } from '../utils/password';

/**
 * Uniformes — /api/uniforms (back-office, FK profondes).
 *
 * Le module est monté derrière une garde en deux temps (cf. uniform.routes.ts) :
 *   - /sign/:token (GET/POST)  : PUBLIC (aucune auth) — signature distante.
 *   - POST /issuances/draft     : ADMIN, RH_RECRUITER, MAGASIN, MAGASIN_GESTION
 *                                 (préparation d'un brouillon, échappe au write-gate).
 *   - tout le reste via authorizeReadWrite :
 *       lecture (GET)  : ADMIN, RH_RECRUITER, MAGASIN, MAGASIN_GESTION
 *       écriture (POST/PUT/DELETE) : ADMIN, RH_RECRUITER, MAGASIN_GESTION
 *
 * On couvre : la garde d'auth (401 sans token, 403 token CLIENT), la garde de
 * rôle (403 MAGASIN lecture-seule sur une écriture), la validation (400 champs
 * requis), 404 (entités introuvables), 409 (doublon de grandeur), et des chemins
 * heureux RÉALISTES qui traversent les FK profondes :
 *   - création d'item + variante (catalogue),
 *   - réappro de stock (mouvement IN auditable → quantityOnHand + bucket),
 *   - cycle remise : brouillon → ajout de ligne → finalize (décrément stock OUT),
 *   - retour GOOD finalisé → réintégration + lot de lavage créé.
 *
 * PIÈGE auth : un token role:'CLIENT' est résolu par passport via la table
 * `clients` (PAS `users`). Pour tester la garde staff (403) on signe sur un VRAI
 * prisma.client.create(...), sinon passport renvoie 401 (client introuvable) et
 * le test mentirait sur la raison du rejet.
 *
 * MOCKS : tous les services externes du module (R2, SMS, PDF d'uniformes,
 * notifications, signature) sont neutralisés — zéro réseau réel. video.service
 * est mocké en `requireActual` + override car createApp monte candidate.routes
 * qui charge `videoUpload` (multer) à l'import : un mock total casserait ce
 * chargement.
 */

// --- Services externes neutralisés (avant import de createApp) ---
jest.mock('../services/r2.service', () => ({
  useR2: false,
  uploadBufferToR2: jest.fn(async (_buf: Buffer, key: string) => ({ key })),
  getSignedFileUrl: jest.fn(async (key: string) => `https://r2.test/${key}`),
}));
jest.mock('../services/sms.service', () => ({
  sendSignatureSms: jest.fn(async () => ({ messageId: 'sms-test' })),
  sendSms: jest.fn(async () => ({ messageId: 'sms-test' })),
  resolveGhlContactId: jest.fn(async () => 'ghl-test'),
}));
jest.mock('../services/uniform-pdf.service', () => ({
  generateIssuancePdf: jest.fn(async () => Buffer.from('pdf')),
  generateReturnPdf: jest.fn(async () => Buffer.from('pdf')),
}));
jest.mock('../services/notification.service', () => ({
  notify: jest.fn(async () => []),
}));
jest.mock('../utils/signature', () => ({
  uploadSignaturePng: jest.fn(async (_b64: string, key: string) => key),
}));
jest.mock('../services/video.service', () => ({
  // Conserve le vrai module (videoUpload/multer est utilisé au chargement par
  // candidate.routes) ; aucun endpoint uniforme ne touche video.service.
  ...jest.requireActual('../services/video.service'),
  getR2SignedUrl: jest.fn(async (key: string) => `https://r2.test/signed/${key}`),
}));

// app importée APRÈS les jest.mock pour que les controllers captent les mocks.
import { createApp } from '../app';

describe('Uniformes — /api/uniforms', () => {
  let app: Express;

  let adminToken: string;
  let magasinToken: string; // lecture seule (MAGASIN)
  let clientToken: string;

  let employeeId: string;
  let itemId: string;
  let variantId: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.uni@test.com', password: pw, firstName: 'Admin', lastName: 'Uni', role: 'ADMIN', isActive: true },
    });
    const magasin = await prisma.user.create({
      data: { email: 'magasin.uni@test.com', password: pw, firstName: 'Mag', lastName: 'Asin', role: 'MAGASIN', isActive: true },
    });
    // Vrai compte CLIENT : passport le résout via la table `clients`.
    const client = await prisma.client.create({
      data: { name: 'Client Uni', email: 'client.uni@test.com', password: pw },
    });

    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    magasinToken = generateAccessToken({ userId: magasin.id, email: magasin.email!, role: magasin.role });
    clientToken = generateAccessToken({ userId: client.id, email: client.email, role: 'CLIENT' });

    // Agent destinataire des remises.
    const employee = await prisma.employee.create({
      data: { firstName: 'Pierre', lastName: 'Lavoie', phone: '4385551111', city: 'Montréal', status: 'ACTIF' },
    });
    employeeId = employee.id;

    // Morceau + variante avec du stock seedé (mouvement IN auditable au BACK_OFFICE).
    const item = await prisma.uniformItem.create({
      data: { division: 'SECURITE', type: 'UNIFORME', name: 'Chemise sécurité', defaultReplacementCost: 25 },
    });
    itemId = item.id;
    const variant = await prisma.uniformVariant.create({
      data: { itemId: item.id, size: 'M', barcode: 'TEST-CHEMISE-M', replacementCost: 25 },
    });
    variantId = variant.id;
    // 10 pièces au BACK_OFFICE — cohérent : bucket + cache total + mouvement.
    await prisma.uniformVariantStock.create({
      data: { variantId: variant.id, location: 'BACK_OFFICE', quantityOnHand: 10 },
    });
    await prisma.uniformVariant.update({ where: { id: variant.id }, data: { quantityOnHand: 10 } });
    await prisma.uniformStockMovement.create({
      data: { variantId: variant.id, type: 'IN', quantity: 10, location: 'BACK_OFFICE', reason: 'Seed' },
    });
  });

  // -------------------------------------------------------------------------
  // Gardes auth / rôle
  // -------------------------------------------------------------------------
  describe('garde auth / rôle', () => {
    it('sans token → 401', async () => {
      const res = await request(app).get('/api/uniforms/items');
      expect(res.status).toBe(401);
    });

    it('token CLIENT → 403 (réservé staff)', async () => {
      const res = await request(app).get('/api/uniforms/items').set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(403);
    });

    it('MAGASIN (lecture seule) peut LIRE → 200', async () => {
      const res = await request(app).get('/api/uniforms/items').set('Authorization', `Bearer ${magasinToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('MAGASIN (lecture seule) en ÉCRITURE (POST item) → 403', async () => {
      const res = await request(app)
        .post('/api/uniforms/items')
        .set('Authorization', `Bearer ${magasinToken}`)
        .send({ division: 'SECURITE', name: 'Interdit' });
      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Catalogue — items & variantes (FK item → variant, contrainte unique)
  // -------------------------------------------------------------------------
  describe('catalogue', () => {
    it('ADMIN crée un item à taille unique → 201 + variante « Unique » auto-créée', async () => {
      const res = await request(app)
        .post('/api/uniforms/items')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ division: 'SIGNALISATION', type: 'EQUIPEMENT', name: 'Cône orange', isOneSize: true, defaultReplacementCost: 12 });
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      // Le controller crée d'emblée la grandeur « Unique » pour rendre l'item stockable.
      const variants = await prisma.uniformVariant.findMany({ where: { itemId: res.body.data.id } });
      expect(variants).toHaveLength(1);
      expect(variants[0].size).toBe('Unique');
      expect(variants[0].barcode).toBeTruthy();
    });

    it('création d\'une variante en double (même grandeur) → 409', async () => {
      // L'item seedé a déjà une variante taille M (TEST-CHEMISE-M).
      const res = await request(app)
        .post(`/api/uniforms/items/${itemId}/variants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ size: 'M', replacementCost: 25 });
      expect(res.status).toBe(409);
    });

    it('création de variante sur un item inexistant → 404', async () => {
      const res = await request(app)
        .post('/api/uniforms/items/00000000-0000-0000-0000-000000000000/variants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ size: 'L' });
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Inventaire — réappro (mouvement IN auditable)
  // -------------------------------------------------------------------------
  describe('inventaire', () => {
    it('réappro avec quantité ≤ 0 → 400', async () => {
      const res = await request(app)
        .post(`/api/uniforms/variants/${variantId}/replenish`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 0, location: 'BACK_OFFICE' });
      expect(res.status).toBe(400);
    });

    it('réappro +5 au BACK_OFFICE → 201 et le cache total monte à 15', async () => {
      const res = await request(app)
        .post(`/api/uniforms/variants/${variantId}/replenish`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 5, location: 'BACK_OFFICE' });
      expect(res.status).toBe(201);

      const variant = await prisma.uniformVariant.findUnique({ where: { id: variantId } });
      expect(variant?.quantityOnHand).toBe(15); // 10 seedés + 5
      const bucket = await prisma.uniformVariantStock.findUnique({
        where: { variantId_location: { variantId, location: 'BACK_OFFICE' } },
      });
      expect(bucket?.quantityOnHand).toBe(15);
      // Le mouvement IN est tracé dans le registre auditable.
      const moves = await prisma.uniformStockMovement.findMany({
        where: { variantId, type: 'IN', reason: { contains: 'approvisionnement' } },
      });
      expect(moves.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Remises — création / validation / 404
  // -------------------------------------------------------------------------
  describe('remises (issuances)', () => {
    it('création sans employeeId → 400', async () => {
      const res = await request(app)
        .post('/api/uniforms/issuances')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ division: 'SECURITE', lines: [] });
      expect(res.status).toBe(400);
    });

    it('création pour un agent inexistant → 404', async () => {
      const res = await request(app)
        .post('/api/uniforms/issuances')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ employeeId: '00000000-0000-0000-0000-000000000000', division: 'SECURITE', lines: [] });
      expect(res.status).toBe(404);
    });

    it('cycle complet : brouillon → finalize décrémente le stock (OUT)', async () => {
      // 1) Brouillon avec 2 chemises M sortant du BACK_OFFICE (où il y a du stock).
      const created = await request(app)
        .post('/api/uniforms/issuances')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId,
          division: 'SECURITE',
          sourceLocation: 'BACK_OFFICE',
          lines: [{ variantId, quantity: 2 }],
        });
      expect(created.status).toBe(201);
      expect(created.body.data.status).toBe('DRAFT');
      const issuanceId = created.body.data.id;
      expect(created.body.data.lines).toHaveLength(1);

      // Stock NON touché tant que c'est un brouillon.
      const before = await prisma.uniformVariant.findUnique({ where: { id: variantId } });
      const qtyBefore = before!.quantityOnHand;

      // 2) Finalize = remise physique → mouvement OUT, stock décrémenté de 2.
      const finalized = await request(app)
        .post(`/api/uniforms/issuances/${issuanceId}/finalize`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(finalized.status).toBe(200);
      expect(finalized.body.data.status).toBe('ISSUED');
      expect(Number(finalized.body.data.totalLoanCost)).toBe(50); // 2 × 25

      const after = await prisma.uniformVariant.findUnique({ where: { id: variantId } });
      expect(after!.quantityOnHand).toBe(qtyBefore - 2);
      const outMove = await prisma.uniformStockMovement.findFirst({
        where: { issuanceId, type: 'OUT' },
      });
      expect(outMove).not.toBeNull();
      expect(outMove!.quantity).toBe(-2); // delta signé

      // 3) L'agent détient bien 2 pièces (computeHoldings via la fiche).
      const fiche = await request(app)
        .get(`/api/uniforms/employees/${employeeId}/fiche`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(fiche.status).toBe(200);
      const holding = fiche.body.data.holdings.find((h: any) => h.variantId === variantId);
      expect(holding?.quantity).toBe(2);

      // 4) Retour finalisé d'1 chemise en bon état → réintégration + lot de lavage.
      const retCreated = await request(app)
        .post('/api/uniforms/returns')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ issuanceId, lines: [{ variantId, quantity: 1, condition: 'GOOD' }] });
      expect(retCreated.status).toBe(201);
      const returnId = retCreated.body.data.id;

      const retFinal = await request(app)
        .post(`/api/uniforms/returns/${returnId}/finalize`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(retFinal.status).toBe(200);
      expect(retFinal.body.data.goodCount).toBe(1);
      // Une pièce GOOD ouvre/alimente un lot de lavage (FK return → washBatchItem).
      expect(retFinal.body.data.washBatchId).toBeTruthy();

      // La remise parente passe à PARTIALLY_RETURNED (il reste 1 pièce détenue).
      const parent = await prisma.uniformIssuance.findUnique({ where: { id: issuanceId } });
      expect(parent?.status).toBe('PARTIALLY_RETURNED');
    });
  });

  // -------------------------------------------------------------------------
  // Brouillon de remise — ouvert à MAGASIN (route hors write-gate)
  // -------------------------------------------------------------------------
  describe('brouillon de remise (POST /issuances/draft)', () => {
    it('MAGASIN (lecture seule) PEUT créer un brouillon → 201', async () => {
      // Route volontairement ouverte à MAGASIN (cf. authorizeRoles dédié) :
      // n'importe qui prépare l'envoi, sans impact stock.
      const res = await request(app)
        .post('/api/uniforms/issuances/draft')
        .set('Authorization', `Bearer ${magasinToken}`)
        .send({ employeeId, division: 'SECURITE', lines: [{ variantId, quantity: 1 }] });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('DRAFT');
    });
  });

  // -------------------------------------------------------------------------
  // Lots de lavage (wash-batch) — validation + 404
  // -------------------------------------------------------------------------
  describe('lots de lavage (wash-batches)', () => {
    it('création sans items → 400', async () => {
      const res = await request(app)
        .post('/api/uniforms/wash-batches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ vendor: 'Nettoyeur X' });
      expect(res.status).toBe(400);
    });

    it('lot inexistant → 404', async () => {
      const res = await request(app)
        .get('/api/uniforms/wash-batches/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('création d\'un lot avec 1 pièce → 201 (FK variant → washBatchItem)', async () => {
      const res = await request(app)
        .post('/api/uniforms/wash-batches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ vendor: 'Nettoyeur X', items: [{ variantId, quantity: 1 }] });
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe('CREATED');
    });
  });
});
