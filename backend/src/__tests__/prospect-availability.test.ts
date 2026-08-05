import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';
import { moveContact } from '../services/contact-move.service';

/**
 * Disponibilités des candidats potentiels — boucle GHL → prospect → candidat.
 *
 * La réponse « Disponibilités » du formulaire GHL restait enfouie dans le JSON
 * `surveyAnswers` (clé opaque, illisible) et se perdait entièrement à la
 * conversion. Elle vit désormais dans 5 colonnes typées, reprises sur le
 * candidat créé.
 */
describe('Prospects — disponibilités', () => {
  let app: Express;
  let adminToken: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const admin = await prisma.user.create({
      data: { email: 'admin.dispo@test.com', password: pw, firstName: 'A', lastName: 'D', role: 'ADMIN', isActive: true },
    });
    adminToken = generateAccessToken({ userId: admin.id, email: admin.email!, role: admin.role });
  });

  const makeProspect = (over: Record<string, unknown> = {}) =>
    prisma.prospectCandidate.create({
      data: {
        firstName: 'Camille',
        lastName: 'Roy',
        phone: '450-555-0200',
        city: 'Laval',
        ...over,
      },
    });

  it('sans token → 401', async () => {
    const p = await makeProspect({ phone: '450-555-0201' });
    const res = await request(app).post(`/api/prospects/${p.id}/convert`).send({});
    expect(res.status).toBe(401);
  });

  it('la conversion reprend les disponibilités du prospect (colonnes + relation)', async () => {
    const p = await makeProspect({
      phone: '450-555-0202',
      availableEvenings: true,
      availableWeekends: true,
    });

    const res = await request(app)
      .post(`/api/prospects/${p.id}/convert`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ firstName: 'Camille', lastName: 'Roy', phone: '450-555-0202', city: 'Laval' });

    expect(res.status).toBe(201);
    const candidateId = res.body.data.id;
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { availabilities: true },
    });

    expect(candidate).toMatchObject({
      availableEvenings: true,
      availableWeekends: true,
      availableDays: false,
      availableNights: false,
    });
    expect(candidate!.availabilities.map((a) => a.type).sort()).toEqual(['FIN_DE_SEMAINE', 'SOIR']);
  });

  it('le formulaire d\'entrevue l\'emporte sur les disponibilités du prospect', async () => {
    const p = await makeProspect({ phone: '450-555-0203', availableEvenings: true });

    const res = await request(app)
      .post(`/api/prospects/${p.id}/convert`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Camille', lastName: 'Roy', phone: '450-555-0203', city: 'Laval',
        availableNight: true,
      });

    expect(res.status).toBe(201);
    const candidate = await prisma.candidate.findUnique({ where: { id: res.body.data.id } });
    expect(candidate).toMatchObject({ availableNights: true, availableEvenings: false });
  });

  it('24/7 coché à l\'entrevue implique les quatre quarts sur le candidat', async () => {
    const p = await makeProspect({ phone: '450-555-0204' });

    const res = await request(app)
      .post(`/api/prospects/${p.id}/convert`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Camille', lastName: 'Roy', phone: '450-555-0204', city: 'Laval',
        available24_7: true,
      });

    expect(res.status).toBe(201);
    const candidate = await prisma.candidate.findUnique({ where: { id: res.body.data.id } });
    expect(candidate).toMatchObject({
      available24_7: true,
      availableDays: true,
      availableEvenings: true,
      availableNights: true,
      availableWeekends: true,
    });
  });

  it('déplacer un prospect vers Candidats conserve ses disponibilités', async () => {
    const p = await makeProspect({ phone: '450-555-0205', availableNights: true });
    const admin = await prisma.user.findFirstOrThrow({ where: { email: 'admin.dispo@test.com' } });

    const moved = await moveContact({
      fromSection: 'prospect',
      fromId: p.id,
      toSection: 'candidate',
      createdById: admin.id,
    });

    const candidate = await prisma.candidate.findUnique({
      where: { id: moved.id },
      include: { availabilities: true },
    });
    expect(candidate!.availableNights).toBe(true);
    expect(candidate!.availabilities.map((a) => a.type)).toEqual(['NUIT']);
  });
});
