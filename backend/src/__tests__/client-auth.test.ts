import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';

/**
 * Portail client — /api/client-auth (client-auth.controller).
 *
 * Le portail client est PUBLIC pour login/refresh et PRIVÉ (token role:'CLIENT')
 * pour les endpoints profil / catalogues / stats. PIÈGE clé : la stratégie
 * passport résout un token CLIENT via la table `clients` (pas `users`) — un token
 * signé sur un id absent de `clients` → 401. Tous les tokens privés ci-dessous
 * sont donc signés sur l'id d'un vrai `prisma.client.create`.
 *
 * Couvre :
 *  - login : 400 (validation Zod email/password), 401 (email inconnu, mauvais
 *    mot de passe, compte sans mot de passe), 200 (chemin heureux + invariant
 *    « jamais le hash en réponse » + accessToken signé role:'CLIENT') ;
 *  - refresh : 401 si refresh token signé avec un rôle staff (pas 'CLIENT') ;
 *  - garde d'auth : 401 sans token sur /profile ;
 *  - profile : 200 (chemin heureux, pas de hash) ;
 *  - catalogues : isolation par client (ne voit QUE ses catalogues) ;
 *  - catalogue détail : 404 sur UUID inconnu, 400 sur :id non-UUID, + masquage
 *    de confidentialité (cvUrl/phone/email/hrNotes nullifiés) sur le chemin heureux.
 */
describe('Portail client — /api/client-auth', () => {
  let app: Express;

  let clientToken: string;        // token role:'CLIENT' du client principal
  let otherClientToken: string;   // token d'un AUTRE client (test d'isolation)

  let clientId: string;
  let catalogueId: string;        // catalogue appartenant au client principal
  let candidateId: string;

  const PASSWORD = 'Secret123';

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword(PASSWORD);

    // Client principal AVEC mot de passe (peut se connecter).
    const client = await prisma.client.create({
      data: {
        name: 'Jean Portail',
        companyName: 'Portail Inc',
        email: 'portail@client.com',
        password: pw,
        phone: '5145550000',
        province: 'QC',
        isActive: true,
      },
    });
    clientId = client.id;
    clientToken = generateAccessToken({ userId: client.id, email: client.email, role: 'CLIENT' });

    // Un AUTRE client (pour vérifier l'isolation des catalogues).
    const other = await prisma.client.create({
      data: { name: 'Autre Client', email: 'autre@client.com', password: pw, isActive: true },
    });
    otherClientToken = generateAccessToken({ userId: other.id, email: other.email, role: 'CLIENT' });

    // Un staff (createdBy obligatoire sur Catalogue et Candidate).
    const staff = await prisma.user.create({
      data: {
        email: 'staff.cauth@test.com',
        password: pw,
        firstName: 'Staff',
        lastName: 'CAuth',
        role: 'ADMIN',
        isActive: true,
      },
    });

    // Un candidat avec des données sensibles (pour vérifier le masquage client).
    const candidate = await prisma.candidate.create({
      data: {
        firstName: 'Marc',
        lastName: 'Sensible',
        email: 'marc@candidat.com',
        phone: '5145559999',
        address: '123 rue Privée',
        city: 'Montréal',
        province: 'QC',
        postalCode: 'H2X1Y4',
        status: 'TRES_BON',
        globalRating: 8.5,
        hrNotes: 'Notes RH internes confidentielles',
        strengths: 'Forces internes',
        weaknesses: 'Faiblesses internes',
        cvUrl: 'https://r2.example/cv-marc.pdf',
        cvStoragePath: 'cvs/marc.pdf',
        videoUrl: 'https://r2.example/video-marc.mp4',
        createdById: staff.id,
      },
    });
    candidateId = candidate.id;

    // Catalogue du client principal, contenant le candidat sensible.
    const catalogue = await prisma.catalogue.create({
      data: {
        clientId: client.id,
        title: 'Mon catalogue',
        status: 'ENVOYE',
        requiresPayment: false,
        isPaid: false,
        createdById: staff.id,
        items: {
          create: [{ candidateId: candidate.id, order: 0 }],
        },
      },
    });
    catalogueId = catalogue.id;
  });

  describe('POST /login', () => {
    it('payload invalide (email manquant) → 400 (validation Zod)', async () => {
      const res = await request(app)
        .post('/api/client-auth/login')
        .send({ password: PASSWORD });
      expect(res.status).toBe(400);
    });

    it('email inconnu → 401', async () => {
      const res = await request(app)
        .post('/api/client-auth/login')
        .send({ email: 'inconnu@nulle-part.com', password: PASSWORD });
      expect(res.status).toBe(401);
    });

    it('mauvais mot de passe → 401', async () => {
      const res = await request(app)
        .post('/api/client-auth/login')
        .send({ email: 'portail@client.com', password: 'MauvaisMotDePasse' });
      expect(res.status).toBe(401);
    });

    it('identifiants valides → 200 + tokens + client sans hash', async () => {
      const res = await request(app)
        .post('/api/client-auth/login')
        .send({ email: 'portail@client.com', password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
      expect(res.body.client.id).toBe(clientId);
      expect(res.body.client.email).toBe('portail@client.com');
      // Invariant S2 : aucun hash de mot de passe ne doit transiter.
      expect(res.body.client.password).toBeUndefined();

      // Le accessToken renvoyé doit réellement ouvrir un endpoint privé CLIENT.
      const me = await request(app)
        .get('/api/client-auth/profile')
        .set('Authorization', `Bearer ${res.body.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.client.id).toBe(clientId);
    });

    it('email normalisé en minuscules → 200 (login insensible à la casse)', async () => {
      const res = await request(app)
        .post('/api/client-auth/login')
        .send({ email: 'PORTAIL@Client.COM', password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.client.id).toBe(clientId);
    });
  });

  describe('POST /refresh', () => {
    it('refresh token avec rôle staff (≠ CLIENT) → 401', async () => {
      // Token de refresh valide cryptographiquement MAIS role:'ADMIN' → le
      // controller refuse explicitement tout ce qui n'est pas role:'CLIENT'.
      const staffRefresh = generateRefreshToken({
        userId: clientId,
        email: 'portail@client.com',
        role: 'ADMIN',
      });
      const res = await request(app)
        .post('/api/client-auth/refresh')
        .send({ refreshToken: staffRefresh });
      expect(res.status).toBe(401);
    });

    it('refresh token CLIENT valide → 200 + nouvel accessToken', async () => {
      const refresh = generateRefreshToken({
        userId: clientId,
        email: 'portail@client.com',
        role: 'CLIENT',
      });
      const res = await request(app)
        .post('/api/client-auth/refresh')
        .send({ refreshToken: refresh });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });
  });

  describe("garde d'authentification", () => {
    it('GET /profile sans token → 401', async () => {
      const res = await request(app).get('/api/client-auth/profile');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /catalogues (isolation par client)', () => {
    it('le client ne voit QUE ses propres catalogues', async () => {
      const res = await request(app)
        .get('/api/client-auth/catalogues')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(catalogueId);
      expect(res.body[0].clientId).toBe(clientId);
    });

    it("un AUTRE client ne voit pas le catalogue du premier → liste vide", async () => {
      const res = await request(app)
        .get('/api/client-auth/catalogues')
        .set('Authorization', `Bearer ${otherClientToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('GET /catalogues/:id', () => {
    it(':id non-UUID → 400 (validation params)', async () => {
      const res = await request(app)
        .get('/api/client-auth/catalogues/pas-un-uuid')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(400);
    });

    it('UUID inconnu (ou catalogue d\'un autre client) → 404', async () => {
      const res = await request(app)
        .get('/api/client-auth/catalogues/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(404);
    });

    it("catalogue d'un autre client → 404 (isolation, pas de fuite)", async () => {
      const res = await request(app)
        .get(`/api/client-auth/catalogues/${catalogueId}`)
        .set('Authorization', `Bearer ${otherClientToken}`);
      expect(res.status).toBe(404);
    });

    it('catalogue propre → 200 + données sensibles du candidat masquées', async () => {
      const res = await request(app)
        .get(`/api/client-auth/catalogues/${catalogueId}`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(catalogueId);
      expect(res.body.items).toHaveLength(1);

      const cand = res.body.items[0].candidate;
      expect(cand.id).toBe(candidateId);
      // CONFIDENTIALITÉ CLIENT : jamais de CV, contacts directs ni notes RH.
      expect(cand.cvUrl).toBeNull();
      expect(cand.cvStoragePath).toBeNull();
      expect(cand.phone).toBeNull();
      expect(cand.email).toBeNull();
      expect(cand.address).toBeNull();
      expect(cand.hrNotes).toBeNull();
      expect(cand.strengths).toBeNull();
      expect(cand.weaknesses).toBeNull();
      // Catalogue non payant non restreint → la vidéo reste visible.
      expect(res.body.isContentRestricted).toBe(false);
      expect(cand.videoUrl).toBe('https://r2.example/video-marc.mp4');

      // Le tracking de vue doit avoir été incrémenté en base.
      const after = await prisma.catalogue.findUnique({ where: { id: catalogueId } });
      expect(after?.viewCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /prospects/stats/by-city (talent pool)', () => {
    it('client authentifié → 200 + agrégat par ville', async () => {
      const res = await request(app)
        .get('/api/client-auth/prospects/stats/by-city')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      // Le candidat seedé (Montréal, isActive, non archivé, non supprimé) compte.
      const mtl = res.body.data.find((d: any) => d.city === 'Montréal');
      expect(mtl).toBeDefined();
      expect(mtl.count).toBeGreaterThanOrEqual(1);
    });

    it('sans token → 401', async () => {
      const res = await request(app).get('/api/client-auth/prospects/stats/by-city');
      expect(res.status).toBe(401);
    });
  });
});
