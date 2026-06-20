import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Lots de lavage — /api/uniforms/wash-batches (sous-routeur `wash.*`).
 *
 * Le routeur uniforme monte ces routes APRÈS `authenticateJWT` puis
 * `authorizeReadWrite(['ADMIN','RH_RECRUITER','MAGASIN','MAGASIN_GESTION'],
 *  ['ADMIN','RH_RECRUITER','MAGASIN_GESTION'])`. Donc :
 *   - GET  : ADMIN, RH, MAGASIN (lecture seule), MAGASIN_GESTION
 *   - POST : ADMIN, RH, MAGASIN_GESTION  (MAGASIN seul → 403 en écriture)
 *
 * Couverture :
 *   - garde d'auth/rôle : 401 sans token, 403 token CLIENT, 403 MAGASIN en POST ;
 *   - validation 400 : create sans `items` ;
 *   - 404 : get d'un lot inexistant ;
 *   - métier 400 : transition invalide (re-`send` d'un lot déjà envoyé),
 *     et stock insuffisant (WASH_IN sans stock BACK_OFFICE) ;
 *   - chemins heureux RÉELS : création (201) qui débite le BACK_OFFICE via
 *     WASH_IN ; ajout de pièces ; et le cycle complet
 *     CREATED → SENT_TO_LAUNDRY → RETURNED_FROM_LAUNDRY → INSPECTED avec
 *     ré-intégration au FRONT_OFFICE (WASH_OUT_GOOD).
 *
 * Le seeding FK respecte l'ordre : UniformItem (division enum) → UniformVariant
 * (barcode unique) → stock BACK_OFFICE via un mouvement IN, car `createBatch`
 * applique un WASH_IN qui exige du stock à l'emplacement BACK_OFFICE.
 *
 * PIÈGE token CLIENT : passport résout role:'CLIENT' via la table `clients`, on
 * signe donc sur un VRAI prisma.client.create (sinon 401 « client introuvable »
 * et le test mentirait sur la raison du rejet).
 *
 * Services externes neutralisés : r2/pdf/notification/email (le controller
 * uniforme importe r2+pdf au chargement ; markReturned/markSent appellent
 * notify()). video.service est partiellement mocké (requireActual) car
 * candidate.routes l'importe au chargement de l'app via createApp().
 */
jest.mock('../services/r2.service', () => ({
  useR2: false,
  uploadBufferToR2: jest.fn(),
  getSignedFileUrl: jest.fn(),
}));
jest.mock('../services/uniform-pdf.service', () => ({
  generateIssuancePdf: jest.fn(),
  generateReturnPdf: jest.fn(),
}));
jest.mock('../services/notification.service', () => ({
  notify: jest.fn(async () => []),
}));
jest.mock('../services/email.service', () => ({
  sendEmail: jest.fn(async () => undefined),
  EMAIL_RH: 'rh@test.local',
  EMAIL_PAIE: 'paie@test.local',
}));
jest.mock('../services/video.service', () => ({
  ...jest.requireActual('../services/video.service'),
  getR2SignedUrl: jest.fn(async (key: string) => `https://r2.test/signed/${key}`),
}));

const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

/** Crée une variante d'uniforme + lui donne du stock BACK_OFFICE via un IN. */
async function seedVariantWithStock(opts: {
  name: string;
  barcode: string;
  backOfficeQty: number;
}): Promise<string> {
  const item = await prisma.uniformItem.create({
    data: { division: 'SECURITE', type: 'UNIFORME', name: opts.name },
  });
  const variant = await prisma.uniformVariant.create({
    data: { itemId: item.id, size: 'M', barcode: opts.barcode },
  });
  if (opts.backOfficeQty > 0) {
    await prisma.uniformVariantStock.create({
      data: { variantId: variant.id, location: 'BACK_OFFICE', quantityOnHand: opts.backOfficeQty },
    });
    await prisma.uniformVariant.update({
      where: { id: variant.id },
      data: { quantityOnHand: opts.backOfficeQty },
    });
    await prisma.uniformStockMovement.create({
      data: { variantId: variant.id, type: 'IN', quantity: opts.backOfficeQty, location: 'BACK_OFFICE', reason: 'seed' },
    });
  }
  return variant.id;
}

describe('Lots de lavage — /api/uniforms/wash-batches', () => {
  let app: Express;
  let adminToken: string;
  let magasinToken: string;
  let clientToken: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.wash@test.com', password: pw, firstName: 'Admin', lastName: 'Wash', role: 'ADMIN', isActive: true },
    });
    // MAGASIN = lecture seule sur le module → 403 en écriture (POST).
    const magasin = await prisma.user.create({
      data: { email: 'magasin.wash@test.com', password: pw, firstName: 'Mag', lastName: 'Asin', role: 'MAGASIN', isActive: true },
    });
    // Vrai compte CLIENT : passport le résout via la table `clients`.
    const client = await prisma.client.create({
      data: { name: 'Client Wash', email: 'client.wash@test.com', password: pw },
    });

    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    magasinToken = generateAccessToken({ userId: magasin.id, email: magasin.email!, role: magasin.role });
    clientToken = generateAccessToken({ userId: client.id, email: client.email, role: 'CLIENT' });
  });

  describe('garde auth / rôle', () => {
    it('sans token → 401', async () => {
      const res = await request(app).get('/api/uniforms/wash-batches');
      expect(res.status).toBe(401);
    });

    it('token CLIENT → 403 (réservé staff)', async () => {
      const res = await request(app)
        .get('/api/uniforms/wash-batches')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(403);
    });

    it('MAGASIN peut LIRE (GET) → 200', async () => {
      const res = await request(app)
        .get('/api/uniforms/wash-batches')
        .set('Authorization', `Bearer ${magasinToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('MAGASIN (lecture seule) en POST create → 403', async () => {
      const res = await request(app)
        .post('/api/uniforms/wash-batches')
        .set('Authorization', `Bearer ${magasinToken}`)
        .send({ items: [] });
      expect(res.status).toBe(403);
    });
  });

  describe('validation & erreurs', () => {
    it('create sans items → 400', async () => {
      const res = await request(app)
        .post('/api/uniforms/wash-batches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ vendor: 'Nettoyeur X' });
      expect(res.status).toBe(400);
    });

    it('get lot inexistant (UUID valide) → 404', async () => {
      const res = await request(app)
        .get(`/api/uniforms/wash-batches/${NONEXISTENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('create avec une variante sans stock BACK_OFFICE → 400 (WASH_IN refusé)', async () => {
      const variantId = await seedVariantWithStock({ name: 'Casquette sans stock', barcode: 'WASH-NOSTOCK-1', backOfficeQty: 0 });
      const res = await request(app)
        .post('/api/uniforms/wash-batches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ variantId, quantity: 1 }] });
      expect(res.status).toBe(400);
      expect(res.body.error || res.body.message).toMatch(/insuffisant/i);
    });
  });

  describe('chemins heureux', () => {
    it('create (201) débite le BACK_OFFICE via WASH_IN et crée 1 item/unité', async () => {
      const variantId = await seedVariantWithStock({ name: 'Chemise lavage', barcode: 'WASH-OK-1', backOfficeQty: 5 });
      const res = await request(app)
        .post('/api/uniforms/wash-batches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ vendor: 'Nettoyeur Pro', items: [{ variantId, quantity: 2 }] });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('CREATED');
      expect(res.body.data.vendor).toBe('Nettoyeur Pro');
      // quantity=2 → 2 items granularité par pièce (qty=1 chacun).
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items.every((i: any) => i.quantity === 1)).toBe(true);

      // WASH_IN a débité le bucket BACK_OFFICE : 5 - 2 = 3.
      const bucket = await prisma.uniformVariantStock.findUnique({
        where: { variantId_location: { variantId, location: 'BACK_OFFICE' } },
      });
      expect(bucket?.quantityOnHand).toBe(3);
      const variant = await prisma.uniformVariant.findUnique({ where: { id: variantId } });
      expect(variant?.quantityOnHand).toBe(3);
    });

    it('addItems sur un lot CREATED ajoute des pièces (200)', async () => {
      const variantId = await seedVariantWithStock({ name: 'Pantalon lavage', barcode: 'WASH-ADD-1', backOfficeQty: 4 });
      const createRes = await request(app)
        .post('/api/uniforms/wash-batches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ variantId, quantity: 1 }] });
      expect(createRes.status).toBe(201);
      const batchId = createRes.body.data.id;

      const addRes = await request(app)
        .post(`/api/uniforms/wash-batches/${batchId}/items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ variantId, quantity: 2 }] });

      expect(addRes.status).toBe(200);
      expect(addRes.body.data.items).toHaveLength(3); // 1 + 2
      // BACK_OFFICE : 4 - 1 (create) - 2 (add) = 1.
      const bucket = await prisma.uniformVariantStock.findUnique({
        where: { variantId_location: { variantId, location: 'BACK_OFFICE' } },
      });
      expect(bucket?.quantityOnHand).toBe(1);
    });

    it('cycle complet : create → send → return → inspect-all-good ré-intègre le FRONT_OFFICE', async () => {
      const variantId = await seedVariantWithStock({ name: 'Veste lavage', barcode: 'WASH-CYCLE-1', backOfficeQty: 3 });

      // 1) create
      const createRes = await request(app)
        .post('/api/uniforms/wash-batches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ vendor: 'Lavoir', items: [{ variantId, quantity: 2 }] });
      expect(createRes.status).toBe(201);
      const batchId = createRes.body.data.id;

      // 2) send : CREATED → SENT_TO_LAUNDRY (+ crée auto un nouveau lot ouvert)
      const sendRes = await request(app)
        .post(`/api/uniforms/wash-batches/${batchId}/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(sendRes.status).toBe(200);
      expect(sendRes.body.data.status).toBe('SENT_TO_LAUNDRY');
      expect(sendRes.body.data.sentAt).toBeTruthy();

      // re-send → transition invalide → 400 (verrouille la machine à états)
      const reSend = await request(app)
        .post(`/api/uniforms/wash-batches/${batchId}/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(reSend.status).toBe(400);

      // 3) return : SENT_TO_LAUNDRY → RETURNED_FROM_LAUNDRY
      const retRes = await request(app)
        .post(`/api/uniforms/wash-batches/${batchId}/return`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(retRes.status).toBe(200);
      expect(retRes.body.data.status).toBe('RETURNED_FROM_LAUNDRY');

      // 4) inspect-all-good : RETURNED → INSPECTED, WASH_OUT_GOOD vers FRONT_OFFICE
      const inspectRes = await request(app)
        .post(`/api/uniforms/wash-batches/${batchId}/inspect-all-good`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(inspectRes.status).toBe(200);
      expect(inspectRes.body.data.status).toBe('INSPECTED');
      expect(inspectRes.body.data.items.every((i: any) => i.postWashCondition === 'GOOD')).toBe(true);

      // Les 2 pièces propres ré-intégrées au comptoir FRONT_OFFICE.
      const front = await prisma.uniformVariantStock.findUnique({
        where: { variantId_location: { variantId, location: 'FRONT_OFFICE' } },
      });
      expect(front?.quantityOnHand).toBe(2);
      // Total reconstitué : 3 (initial) - 2 (WASH_IN) + 2 (WASH_OUT_GOOD) = 3.
      const variant = await prisma.uniformVariant.findUnique({ where: { id: variantId } });
      expect(variant?.quantityOnHand).toBe(3);
    });
  });
});
