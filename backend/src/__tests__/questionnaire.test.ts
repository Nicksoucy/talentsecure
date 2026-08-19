import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';
import { ALL_ITEMS, QUESTIONNAIRE_VERSION } from '../utils/questionnaireItems';

/**
 * Questionnaire — routes publiques (src/routes/public-questionnaire.routes.ts)
 * et routes personnel (src/routes/questionnaire.routes.ts).
 *
 * Points sensibles couverts :
 *  - la route publique ne doit JAMAIS exiger d'authentification ;
 *  - tous les liens refusés renvoient le même 404 (aucun oracle d'énumération) ;
 *  - le détail énoncé par énoncé est réservé ADMIN (recommandation CDPDJ) ;
 *  - le consentement est exigé explicitement (Loi 25, art. 14) ;
 *  - les écarts personne ↔ site n'excluent personne du jumelage.
 */

const MTL = { lat: 45.5019, lng: -73.5674 };

/** Réponses complètes et cohérentes (inversés répondus dans l'autre sens). */
function coherentAnswers(high = 5) {
  return ALL_ITEMS.map((i) => ({
    itemId: i.id,
    value: i.reverse ? 6 - high : high,
    elapsedMs: 4000,
  }));
}

describe('Questionnaire', () => {
  let app: Express;
  let adminToken: string;
  let salesToken: string;
  let candidateId: string;
  let mandateId: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: {
        email: 'admin.quest@test.com', password: pw, firstName: 'Admin',
        lastName: 'Staff', role: 'ADMIN', isActive: true,
      },
    });
    const sales = await prisma.user.create({
      data: {
        email: 'sales.quest@test.com', password: pw, firstName: 'Sales',
        lastName: 'Staff', role: 'SALES', isActive: true,
      },
    });
    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });

    const candidate = await prisma.candidate.create({
      data: {
        firstName: 'Alex', lastName: 'Roy', phone: '5145559001', city: 'Montréal',
        createdById: admin.id, hasBSP: true, availableNights: true,
        lat: 45.5119, lng: -73.5674,
      },
    });
    candidateId = candidate.id;

    // Mandat très monotone et très solitaire → servira aux écarts.
    const mandate = await prisma.mandate.create({
      data: {
        externalId: 'GAR-QUEST-1', name: 'Poste de nuit monotone', city: 'Montréal',
        lat: MTL.lat, lng: MTL.lng, requiresBSP: true, shiftNights: true,
        monotony: 5, autonomy: 5, conflictFrequency: 1,
        profileUpdatedAt: new Date(),
      },
    });
    mandateId = mandate.id;
  });

  /** Génère un lien d'invitation et renvoie son jeton. */
  async function invite(personId = candidateId): Promise<string> {
    const res = await request(app)
      .post('/api/questionnaires/invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ personType: 'candidate', personId });
    expect(res.status).toBe(200);
    return res.body.data.url.split('/').pop();
  }

  /**
   * Invitation VIERGE.
   *
   * `invite()` reprend volontairement l'invitation en cours (c'est le
   * comportement attendu et testé plus bas), ce qui ferait hériter chaque test
   * des réponses du précédent. On ferme donc d'abord celles qui traînent.
   */
  async function freshInvite(personId = candidateId): Promise<string> {
    await prisma.questionnaireResponse.deleteMany({
      where: { personId, status: 'IN_PROGRESS' },
    });
    return invite(personId);
  }

  describe('invitation (personnel)', () => {
    it('SALES ne peut pas générer de lien → 403', async () => {
      const res = await request(app)
        .post('/api/questionnaires/invitations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ personType: 'candidate', personId: candidateId });
      expect(res.status).toBe(403);
    });

    it('sans token → 401', async () => {
      const res = await request(app)
        .post('/api/questionnaires/invitations')
        .send({ personType: 'candidate', personId: candidateId });
      expect(res.status).toBe(401);
    });

    it('personne inexistante → 404', async () => {
      const res = await request(app)
        .post('/api/questionnaires/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ personType: 'candidate', personId: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(404);
    });

    it('recliquer « envoyer » reprend le même lien au lieu de tuer le précédent', async () => {
      const premier = await invite();
      const second = await invite();
      expect(second).toBe(premier);
    });
  });

  describe('page publique', () => {
    it('ne demande aucune authentification', async () => {
      const token = await freshInvite();
      const res = await request(app).get(`/api/public/questionnaire/session?token=${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.firstName).toBe('Alex');
      expect(res.body.data.items).toHaveLength(ALL_ITEMS.length);
      expect(res.body.data.version).toBe(QUESTIONNAIRE_VERSION);
    });

    it('ne divulgue que le prénom, jamais le reste de la fiche', async () => {
      const token = await freshInvite();
      const res = await request(app).get(`/api/public/questionnaire/session?token=${token}`);
      const payload = JSON.stringify(res.body);
      expect(payload).not.toContain('5145559001'); // téléphone
      expect(payload).not.toContain('Roy'); // nom de famille
      expect(payload).not.toContain(candidateId);
    });

    it('jeton inconnu, malformé ou absent → refusé sans rien révéler', async () => {
      const inconnu = await request(app).get(
        '/api/public/questionnaire/session?token=aaaaaaaaaaaaaaaaaaaaaaaa'
      );
      expect(inconnu.status).toBe(404);
      expect(inconnu.body.message).toMatch(/plus valide/i);

      expect((await request(app).get('/api/public/questionnaire/session?token=court')).status).toBe(400);
      expect((await request(app).get('/api/public/questionnaire/session')).status).toBe(400);
    });

    it('jeton expiré → même 404 qu un jeton inconnu', async () => {
      const token = await freshInvite();
      await prisma.questionnaireResponse.update({
        where: { accessToken: token },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await request(app).get(`/api/public/questionnaire/session?token=${token}`);
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/plus valide/i);
    });

    it('sauvegarde les réponses partielles et les rejoue à la réouverture', async () => {
      const token = await freshInvite();
      const partiel = coherentAnswers().slice(0, 4);

      const save = await request(app)
        .post('/api/public/questionnaire/answers')
        .send({ token, answers: partiel });
      expect(save.status).toBe(200);
      expect(save.body.data.saved).toBe(4);

      const session = await request(app).get(`/api/public/questionnaire/session?token=${token}`);
      expect(session.body.data.answers).toHaveLength(4);
    });

    it('revenir sur une réponse l écrase au lieu d en empiler une deuxième', async () => {
      const token = await freshInvite();
      const item = ALL_ITEMS[0].id;
      await request(app)
        .post('/api/public/questionnaire/answers')
        .send({ token, answers: [{ itemId: item, value: 2 }] });
      await request(app)
        .post('/api/public/questionnaire/answers')
        .send({ token, answers: [{ itemId: item, value: 5 }] });

      const session = await request(app).get(`/api/public/questionnaire/session?token=${token}`);
      expect(session.body.data.answers).toEqual([{ itemId: item, value: 5 }]);
    });

    it('ignore un énoncé inconnu sans perdre les bonnes réponses', async () => {
      const token = await freshInvite();
      const res = await request(app)
        .post('/api/public/questionnaire/answers')
        .send({
          token,
          answers: [
            { itemId: ALL_ITEMS[0].id, value: 4 },
            { itemId: 'item_dune_vieille_version', value: 3 },
          ],
        });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ saved: 1, ignored: 1 });
    });

    it('valeur hors de l échelle → 400', async () => {
      const token = await freshInvite();
      const res = await request(app)
        .post('/api/public/questionnaire/answers')
        .send({ token, answers: [{ itemId: ALL_ITEMS[0].id, value: 9 }] });
      expect(res.status).toBe(400);
    });
  });

  describe('soumission', () => {
    it('refuse sans consentement explicite', async () => {
      const token = await freshInvite();
      await request(app)
        .post('/api/public/questionnaire/answers')
        .send({ token, answers: coherentAnswers() });

      const res = await request(app)
        .post('/api/public/questionnaire/submit')
        .send({ token, consent: false });
      expect(res.status).toBe(400);
    });

    it('refuse un questionnaire incomplet et nomme les manques', async () => {
      const token = await freshInvite();
      await request(app)
        .post('/api/public/questionnaire/answers')
        .send({ token, answers: coherentAnswers().slice(0, 3) });

      const res = await request(app)
        .post('/api/public/questionnaire/submit')
        .send({ token, consent: true });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('QUESTIONNAIRE_INCOMPLET');
      expect(res.body.details).toHaveLength(ALL_ITEMS.length - 3);
    });

    it('enregistre les scores, horodate le consentement, et ferme le lien', async () => {
      const token = await freshInvite();
      await request(app)
        .post('/api/public/questionnaire/answers')
        .send({ token, answers: coherentAnswers(5) });

      const res = await request(app)
        .post('/api/public/questionnaire/submit')
        .send({ token, consent: true });
      expect(res.status).toBe(200);
      // Le candidat ne reçoit AUCUN score : ce n'est pas un test qu'on réussit.
      expect(JSON.stringify(res.body.data)).not.toMatch(/trait|score/i);

      const saved = await prisma.questionnaireResponse.findUnique({
        where: { accessToken: token },
      });
      expect(saved?.status).toBe('COMPLETED');
      expect(saved?.consentAt).not.toBeNull();
      expect(saved?.traitDependability).toBe(5);
      expect(saved?.careless).toBe(false);

      // Lien à usage unique une fois soumis.
      const rouvrir = await request(app).get(`/api/public/questionnaire/session?token=${token}`);
      expect(rouvrir.status).toBe(404);
    });

    it('signale un questionnaire bâclé sans le rejeter', async () => {
      const token = await freshInvite();
      const toutPareil = ALL_ITEMS.map((i) => ({ itemId: i.id, value: 5, elapsedMs: 300 }));
      await request(app).post('/api/public/questionnaire/answers').send({ token, answers: toutPareil });

      const res = await request(app)
        .post('/api/public/questionnaire/submit')
        .send({ token, consent: true });
      expect(res.status).toBe(200); // accepté malgré tout

      const saved = await prisma.questionnaireResponse.findUnique({
        where: { accessToken: token },
      });
      expect(saved?.careless).toBe(true);
      expect(saved?.qualityFlags.length).toBeGreaterThan(0);
    });
  });

  describe('lecture par le personnel', () => {
    it('renvoie les conclusions, pas le détail', async () => {
      const res = await request(app)
        .get(`/api/questionnaires/person/candidate/${candidateId}`)
        .set('Authorization', `Bearer ${salesToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('traitDependability');
      expect(res.body.data).not.toHaveProperty('answers');
    });

    it('le détail énoncé par énoncé est réservé ADMIN', async () => {
      const response = await prisma.questionnaireResponse.findFirst({
        where: { status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
      });

      const refuse = await request(app)
        .get(`/api/questionnaires/responses/${response!.id}`)
        .set('Authorization', `Bearer ${salesToken}`);
      expect(refuse.status).toBe(403);

      const permis = await request(app)
        .get(`/api/questionnaires/responses/${response!.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(permis.status).toBe(200);
      expect(permis.body.data.detail).toHaveLength(ALL_ITEMS.length);
      expect(permis.body.data.detail[0]).toHaveProperty('text');
    });

    it('personne sans questionnaire → 200 avec null, pas une erreur', async () => {
      const autre = await prisma.candidate.create({
        data: {
          firstName: 'Sans', lastName: 'Questionnaire', phone: '5145559002',
          city: 'Laval', createdById: (await prisma.user.findFirst({ where: { role: 'ADMIN' } }))!.id,
        },
      });
      const res = await request(app)
        .get(`/api/questionnaires/person/candidate/${autre.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });
  });

  describe('effet sur le jumelage', () => {
    it('affiche les écarts sans jamais exclure le candidat', async () => {
      // Alex a répondu « 5 » aux préférences directes → tolérance élevée partout,
      // sauf que les préférences ne sont pas inversées : il tolère tout à 5.
      // On abaisse sa tolérance à la monotonie pour créer un écart réel.
      const response = await prisma.questionnaireResponse.findFirst({
        where: { personId: candidateId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' }, // celle que le jumelage lira
      });
      await prisma.questionnaireResponse.update({
        where: { id: response!.id },
        data: { prefMonotonyTolerance: 1, prefAutonomy: 2 },
      });

      const res = await request(app)
        .get(`/api/mandates/${mandateId}/candidates`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const alex = res.body.data.candidates.find(
        (c: { candidateId: string }) => c.candidateId === candidateId
      );
      expect(alex).toBeDefined();
      expect(alex.eligible).toBe(true); // l'écart n'exclut pas
      expect(alex.hasQuestionnaire).toBe(true);
      expect(alex.frictions[0]).toMatchObject({
        dimension: 'monotonyTolerance', siteRating: 5, tolerance: 1, gap: 4,
      });
    });

    it('un candidat sans questionnaire reste proposable, sans écart inventé', async () => {
      const res = await request(app)
        .get(`/api/mandates/${mandateId}/candidates?includeIneligible=true`)
        .set('Authorization', `Bearer ${adminToken}`);
      const sans = res.body.data.candidates.find(
        (c: { firstName: string }) => c.firstName === 'Sans'
      );
      expect(sans.hasQuestionnaire).toBe(false);
      expect(sans.frictions).toEqual([]);
    });
  });
});
