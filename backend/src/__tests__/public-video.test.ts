import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';

/**
 * Téléversement public de la vidéo de présentation — /api/public/video/*
 *
 * Endpoints (src/routes/public-video.routes.ts), AUCUNE authentification :
 * le candidat n'a pas de compte. Le contrôle d'accès repose sur l'identifiant
 * de contact GHL (chaîne opaque) revalidé contre l'API GHL à chaque appel.
 *
 *   GET  /api/public/video/session   → getVideoSession
 *   POST /api/public/video/initiate  → initiateVideoUpload
 *   POST /api/public/video/complete  → completeVideoUpload
 *
 * Couvre :
 *  - validation du lien : contact inconnu, autre location, contact trop ancien ;
 *  - garde-fous de l'URL présignée : type non-vidéo, taille hors plafond ;
 *  - clé imposée par le serveur (préfixe videos/inbox/{contactId}/) et refus
 *    d'une clé qui n'appartient pas au contact ;
 *  - vérification post-téléversement : objet absent, magic bytes non-vidéo
 *    (l'objet est alors supprimé de R2) ;
 *  - chemins heureux : rattachement immédiat quand le prospect existe,
 *    mise en attente sinon.
 *
 * Le rate limit (videoUploadLimiter) n'est pas testé ici : comme tous les
 * limiteurs du projet il porte `skip: skipInTests`, donc il est désactivé sous
 * jest par conception (voir middleware/rate-limit.middleware.ts).
 *
 * Services externes MOCKÉS (zéro réseau réel) : ../services/ghl.client et
 * ../services/r2.service.
 */

jest.mock('../services/ghl.client', () => ({
  getContactById: jest.fn(),
  getGhlLocationId: jest.fn(() => 'loc-test'),
  setContactCustomField: jest.fn(async () => undefined),
}));

jest.mock('../services/r2.service', () => ({
  useR2: true,
  getConstrainedUploadUrl: jest.fn(async () => 'https://r2.example/signed-put'),
  headObjectInR2: jest.fn(),
  readObjectPrefix: jest.fn(),
  deleteFileFromR2: jest.fn(async () => undefined),
}));

import { createApp } from '../app';
const ghlClient = require('../services/ghl.client');
const r2 = require('../services/r2.service');

const SESSION_URL = '/api/public/video/session';
const INITIATE_URL = '/api/public/video/initiate';
const COMPLETE_URL = '/api/public/video/complete';

const CONTACT_ID = 'ghlContact0001';

/** Entête d'un MP4 réel : la box `ftyp` est à l'offset 4. */
const MP4_PREFIX = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypmp42'),
  Buffer.alloc(16),
]);

const contact = (over: Record<string, any> = {}) => ({
  id: CONTACT_ID,
  locationId: 'loc-test',
  firstName: 'Amélie',
  email: 'amelie@example.com',
  phone: '+15145550123',
  dateAdded: new Date().toISOString(),
  ...over,
});

describe('Téléversement vidéo public — /api/public/video', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    jest.clearAllMocks();
    ghlClient.getGhlLocationId.mockReturnValue('loc-test');
    r2.getConstrainedUploadUrl.mockResolvedValue('https://r2.example/signed-put');
    r2.deleteFileFromR2.mockResolvedValue(undefined);
  });

  describe('GET /session — validation du lien', () => {
    it('sans identifiant de contact → 400 (validation)', async () => {
      const res = await request(app).get(SESSION_URL);
      expect(res.status).toBe(400);
    });

    it('contact inconnu de GHL → 404 générique', async () => {
      ghlClient.getContactById.mockResolvedValue(null);
      const res = await request(app).get(SESSION_URL).query({ c: CONTACT_ID });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('LIEN_INVALIDE');
    });

    it("contact appartenant à une AUTRE location → 404 (pas d'accès croisé)", async () => {
      ghlClient.getContactById.mockResolvedValue(contact({ locationId: 'une-autre-location' }));
      const res = await request(app).get(SESSION_URL).query({ c: CONTACT_ID });
      expect(res.status).toBe(404);
    });

    it('contact plus vieux que la fenêtre de 72 h → 404 (lien périmé)', async () => {
      const old = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();
      ghlClient.getContactById.mockResolvedValue(contact({ dateAdded: old, dateUpdated: old }));
      const res = await request(app).get(SESSION_URL).query({ c: CONTACT_ID });
      expect(res.status).toBe(404);
    });

    it('GHL injoignable → 503, JAMAIS « lien invalide »', async () => {
      // Répondre 404 ici ferait croire au candidat que son lien est mort ; il
      // abandonnerait alors que le problème est de notre côté et temporaire.
      ghlClient.getContactById.mockRejectedValue(new Error('GHL_PIT_TOKEN absent'));
      const res = await request(app).get(SESSION_URL).query({ c: CONTACT_ID });
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('SERVICE_INDISPONIBLE');
    });

    it('lien valide → prénom + aucune vidéo encore reçue', async () => {
      ghlClient.getContactById.mockResolvedValue(contact());
      const res = await request(app).get(SESSION_URL).query({ c: CONTACT_ID });
      expect(res.status).toBe(200);
      expect(res.body.firstName).toBe('Amélie');
      expect(res.body.alreadyUploaded).toBe(false);
      expect(res.body.maxBytes).toBe(500 * 1024 * 1024);
    });

    it('accepte aussi le paramètre contact_id (celui que GHL ajoute lui-même)', async () => {
      ghlClient.getContactById.mockResolvedValue(contact());
      const res = await request(app).get(SESSION_URL).query({ contact_id: CONTACT_ID });
      expect(res.status).toBe(200);
      expect(res.body.firstName).toBe('Amélie');
    });

    it('merge field NON interpolé dans c, mais contact_id valide → on retient contact_id', async () => {
      // Cas réel : la redirection GHL peut livrer `?c={{contact.id}}` tel quel
      // tout en ajoutant son propre `contact_id`. Prendre `c` aveuglément
      // afficherait « lien invalide » alors que le bon id est juste à côté.
      ghlClient.getContactById.mockResolvedValue(contact());
      const res = await request(app)
        .get(SESSION_URL)
        .query({ c: '{{contact.id}}', contact_id: CONTACT_ID });
      expect(res.status).toBe(200);
      expect(res.body.firstName).toBe('Amélie');
      expect(ghlClient.getContactById).toHaveBeenCalledWith(CONTACT_ID);
    });

    it('merge field non interpolé et RIEN d’autre → 400 (aucun appel à GHL)', async () => {
      const res = await request(app).get(SESSION_URL).query({ c: '{{contact.id}}' });
      expect(res.status).toBe(400);
      expect(ghlClient.getContactById).not.toHaveBeenCalled();
    });

    it('vidéo déjà en attente pour ce contact → alreadyUploaded true', async () => {
      ghlClient.getContactById.mockResolvedValue(contact());
      await prisma.pendingVideoUpload.create({
        data: { ghlContactId: CONTACT_ID, storagePath: `videos/inbox/${CONTACT_ID}/a.mp4` },
      });
      const res = await request(app).get(SESSION_URL).query({ c: CONTACT_ID });
      expect(res.body.alreadyUploaded).toBe(true);
    });
  });

  describe('POST /initiate — URL présignée', () => {
    beforeEach(() => {
      ghlClient.getContactById.mockResolvedValue(contact());
    });

    it('type non-vidéo → 400 (aucune URL émise)', async () => {
      const res = await request(app).post(INITIATE_URL).send({
        c: CONTACT_ID,
        filename: 'cv.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1000,
      });
      expect(res.status).toBe(400);
      expect(r2.getConstrainedUploadUrl).not.toHaveBeenCalled();
    });

    it('taille au-delà de 500 Mo → 400 (aucune URL émise)', async () => {
      const res = await request(app).post(INITIATE_URL).send({
        c: CONTACT_ID,
        filename: 'grosse.mp4',
        contentType: 'video/mp4',
        sizeBytes: 600 * 1024 * 1024,
      });
      expect(res.status).toBe(400);
      expect(r2.getConstrainedUploadUrl).not.toHaveBeenCalled();
    });

    it('lien invalide → 404 avant tout appel à R2', async () => {
      ghlClient.getContactById.mockResolvedValue(null);
      const res = await request(app).post(INITIATE_URL).send({
        c: CONTACT_ID,
        filename: 'v.mp4',
        contentType: 'video/mp4',
        sizeBytes: 1024,
      });
      expect(res.status).toBe(404);
      expect(r2.getConstrainedUploadUrl).not.toHaveBeenCalled();
    });

    it('demande valide → clé sous videos/inbox/{contactId}/ et taille figée', async () => {
      const res = await request(app).post(INITIATE_URL).send({
        c: CONTACT_ID,
        filename: 'ma video.mp4',
        contentType: 'video/mp4',
        sizeBytes: 2048,
      });
      expect(res.status).toBe(200);
      expect(res.body.uploadUrl).toBe('https://r2.example/signed-put');
      expect(res.body.key).toMatch(new RegExp(`^videos/inbox/${CONTACT_ID}/[0-9a-f-]+\\.mp4$`));
      expect(res.body.contentType).toBe('video/mp4');

      // La taille exacte doit être signée, sinon la contrainte est décorative.
      expect(r2.getConstrainedUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'video/mp4', exactBytes: 2048 })
      );
    });

    it("normalise le type de MediaRecorder (`video/webm;codecs=…`) avant de signer", async () => {
      const res = await request(app).post(INITIATE_URL).send({
        c: CONTACT_ID,
        filename: 'presentation.webm',
        contentType: 'video/webm;codecs=vp8,opus',
        sizeBytes: 4096,
      });
      expect(res.status).toBe(200);
      // Le client doit renvoyer CE type au PUT : tout écart casse la signature.
      expect(res.body.contentType).toBe('video/webm');
      expect(res.body.key).toMatch(/\.webm$/);
    });

    it("le nom de fichier fourni n'influence jamais la clé R2", async () => {
      const res = await request(app).post(INITIATE_URL).send({
        c: CONTACT_ID,
        filename: '../../../etc/passwd.mp4',
        contentType: 'video/mp4',
        sizeBytes: 1024,
      });
      expect(res.status).toBe(200);
      expect(res.body.key).not.toContain('..');
      expect(res.body.key).toMatch(new RegExp(`^videos/inbox/${CONTACT_ID}/`));
    });
  });

  describe('POST /complete — vérification et rattachement', () => {
    const key = `videos/inbox/${CONTACT_ID}/abc.mp4`;

    beforeEach(() => {
      ghlClient.getContactById.mockResolvedValue(contact());
      r2.headObjectInR2.mockResolvedValue({ contentLength: 5_000_000, contentType: 'video/mp4' });
      r2.readObjectPrefix.mockResolvedValue(MP4_PREFIX);
    });

    it("clé n'appartenant pas à ce contact → 404 (pas d'appropriation d'objet)", async () => {
      const res = await request(app)
        .post(COMPLETE_URL)
        .send({ c: CONTACT_ID, key: 'videos/inbox/unAutreContact/vole.mp4' });
      expect(res.status).toBe(404);
    });

    it('objet absent de R2 → 400', async () => {
      r2.headObjectInR2.mockResolvedValue(null);
      const res = await request(app).post(COMPLETE_URL).send({ c: CONTACT_ID, key });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('TELEVERSEMENT_INTROUVABLE');
    });

    it('fichier vide → 400 et suppression de R2', async () => {
      r2.headObjectInR2.mockResolvedValue({ contentLength: 12, contentType: 'video/mp4' });
      const res = await request(app).post(COMPLETE_URL).send({ c: CONTACT_ID, key });
      expect(res.status).toBe(400);
      expect(r2.deleteFileFromR2).toHaveBeenCalledWith(key);
    });

    it('magic bytes non-vidéo → 400 et suppression de R2', async () => {
      r2.readObjectPrefix.mockResolvedValue(Buffer.from('%PDF-1.7 pas une video du tout'));
      const res = await request(app).post(COMPLETE_URL).send({ c: CONTACT_ID, key });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('FICHIER_NON_VIDEO');
      expect(r2.deleteFileFromR2).toHaveBeenCalledWith(key);
    });

    it('vidéo valide, prospect déjà créé → rattachement immédiat', async () => {
      const prospect = await prisma.prospectCandidate.create({
        data: { firstName: 'Amélie', lastName: 'Roy', email: 'amelie@example.com', phone: '5145550123' },
      });

      const res = await request(app).post(COMPLETE_URL).send({ c: CONTACT_ID, key });
      expect(res.status).toBe(201);
      expect(res.body.attached).toBe(true);

      const updated = await prisma.prospectCandidate.findUnique({ where: { id: prospect.id } });
      expect(updated?.videoStoragePath).toBe(key);
      expect(updated?.videoUploadedAt).toBeTruthy();

      const pending = await prisma.pendingVideoUpload.findUnique({
        where: { ghlContactId: CONTACT_ID },
      });
      expect(pending?.claimedByProspectId).toBe(prospect.id);
    });

    it("vidéo valide, prospect pas encore créé → mise en attente (la course avec le webhook)", async () => {
      const res = await request(app).post(COMPLETE_URL).send({ c: CONTACT_ID, key });
      expect(res.status).toBe(201);
      expect(res.body.attached).toBe(false);

      const pending = await prisma.pendingVideoUpload.findUnique({
        where: { ghlContactId: CONTACT_ID },
      });
      expect(pending?.storagePath).toBe(key);
      expect(pending?.claimedAt).toBeNull();
      expect(pending?.email).toBe('amelie@example.com');
    });

    it('marque le contact GHL pour couper le workflow de rappel', async () => {
      await request(app).post(COMPLETE_URL).send({ c: CONTACT_ID, key });
      expect(ghlClient.setContactCustomField).toHaveBeenCalledWith(CONTACT_ID, 'video_recue', 'true');
    });

    it('un échec du marquage GHL ne fait pas échouer la réception', async () => {
      ghlClient.setContactCustomField.mockRejectedValue(new Error('GHL down'));
      const res = await request(app).post(COMPLETE_URL).send({ c: CONTACT_ID, key });
      expect(res.status).toBe(201);
    });

    it('un second envoi remplace le précédent au lieu d’empiler des orphelins', async () => {
      const key2 = `videos/inbox/${CONTACT_ID}/def.mp4`;
      await request(app).post(COMPLETE_URL).send({ c: CONTACT_ID, key });
      await request(app).post(COMPLETE_URL).send({ c: CONTACT_ID, key: key2 });

      const rows = await prisma.pendingVideoUpload.findMany({ where: { ghlContactId: CONTACT_ID } });
      expect(rows).toHaveLength(1);
      expect(rows[0].storagePath).toBe(key2);
    });
  });
});
