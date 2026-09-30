import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';
import { addDaysYmd, montrealYmd } from '../utils/montreal-date';

// Réseau simulé : courriel (fournisseur), contact GHL et texto.
const sendEmailWithProvider = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/notification.service', () => ({
  ...jest.requireActual('../services/notification.service'),
  sendEmailWithProvider: (...args: unknown[]) => sendEmailWithProvider(...args),
}));
const sendSms = jest.fn().mockResolvedValue({ messageId: 'sms-1' });
jest.mock('../services/sms.service', () => ({
  resolveGhlContactId: jest.fn().mockResolvedValue('contact-found'),
  sendSms: (...args: unknown[]) => sendSms(...args),
}));
jest.mock('../services/ghl-email.service', () => ({
  ...jest.requireActual('../services/ghl-email.service'),
  upsertPersonContact: jest.fn().mockResolvedValue('contact-upserted'),
}));
jest.mock('../services/addressGeocode.service', () => ({
  ...jest.requireActual('../services/addressGeocode.service'),
  geocodeEmployeeById: jest.fn().mockResolvedValue(null),
}));

/**
 * « Fermer le dossier » — /api/employees/:id/closure.
 * Vérifie : statut + date limite, courriel À employé CC paie + RH avec pièces et
 * montant, texto, trace enregistrée, échec d'envoi non bloquant, renvoi.
 */
describe('Fermeture de dossier — /api/employees/:id/closure', () => {
  let app: Express;
  let rhToken: string;
  let salesToken: string;

  const deadline = addDaysYmd(montrealYmd(), 14);
  const body = (extra: Record<string, unknown> = {}) => ({
    reason: 'INACTIVITE',
    reasonText: 'Votre dossier est fermé en date d’aujourd’hui.',
    deadline,
    sendSms: true,
    ...extra,
  });

  async function seedEmployee(opts: { email?: string | null; phone?: string; withUniform?: boolean } = {}) {
    const emp = await prisma.employee.create({
      data: {
        firstName: 'Jean',
        lastName: `Test${Math.random().toString(36).slice(2, 7)}`,
        email: opts.email === undefined ? 'jean@example.com' : opts.email,
        phone: opts.phone ?? '5145550000',
        status: 'ACTIF',
      },
    });
    if (opts.withUniform !== false) {
      const item = await prisma.uniformItem.create({
        data: { division: 'SECURITE', name: `Chemise ${emp.lastName}`, defaultReplacementCost: 35 },
      });
      const variant = await prisma.uniformVariant.create({
        data: { itemId: item.id, size: 'M', barcode: `CL-${emp.lastName}`, replacementCost: 35 },
      });
      await prisma.uniformIssuance.create({
        data: {
          employeeId: emp.id, division: 'SECURITE', status: 'ISSUED',
          lines: { create: [{ variantId: variant.id, quantity: 3, unitCostSnapshot: 35 }] },
        },
      });
    }
    return emp;
  }

  beforeAll(async () => {
    process.env.GHL_PIT_TOKEN = 'test-token';
    process.env.GHL_LOCATION_ID = 'test-location';
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');
    const rh = await prisma.user.create({
      data: { email: 'rh.close@test.com', password: pw, firstName: 'Tamara', lastName: 'Hadid', role: 'RH_RECRUITER', isActive: true },
    });
    const sales = await prisma.user.create({
      data: { email: 'sales.close@test.com', password: pw, firstName: 'S', lastName: 'S', role: 'SALES', isActive: true },
    });
    rhToken = generateAccessToken({ userId: rh.id, email: rh.email, role: rh.role });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email, role: sales.role });
  });

  afterAll(() => {
    delete process.env.GHL_PIT_TOKEN;
    delete process.env.GHL_LOCATION_ID;
  });

  beforeEach(() => {
    sendEmailWithProvider.mockClear().mockResolvedValue(undefined);
    sendSms.mockClear().mockResolvedValue({ messageId: 'sms-1' });
  });

  it('GET : défauts (+14 jours, CC paie + RH) et estimation des uniformes', async () => {
    const emp = await seedEmployee();
    const res = await request(app).get(`/api/employees/${emp.id}/closure`).set('Authorization', `Bearer ${rhToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.defaults.deadline).toBe(deadline);
    expect(res.body.data.defaults.cc).toEqual(['paie@xguard.ca', 'rh@xguard.ca']);
    expect(res.body.data.estimate.total).toBe(105);
    expect(res.body.data.notices).toEqual([]);
    expect(res.body.data.tracking).toBeNull();
  });

  it('aperçu : lettre avec motif, date limite, pièces et montant ; texto ; rien n’est modifié', async () => {
    const emp = await seedEmployee();
    const res = await request(app)
      .post(`/api/employees/${emp.id}/closure/preview`)
      .set('Authorization', `Bearer ${rhToken}`)
      .send(body({ reasonText: 'Motif <b>test</b>' }));
    expect(res.status).toBe(200);
    const { html, sms, to, cc } = res.body.data;
    expect(to).toBe('jean@example.com');
    expect(cc).toEqual(['paie@xguard.ca', 'rh@xguard.ca']);
    expect(html).toContain('Motif &lt;b&gt;test&lt;/b&gt;'); // échappé
    expect(html).toContain('105,00 $');
    expect(html).toContain('au plus tard le');
    expect(html).toContain('Tamara Hadid');
    expect(sms).toContain('105,00 $');
    expect(sms.length).toBeLessThanOrEqual(320);
    const after = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(after?.status).toBe('ACTIF');
    expect(sendEmailWithProvider).not.toHaveBeenCalled();
  });

  it('envoi : INACTIF + date limite, courriel À employé CC paie + RH, texto, trace', async () => {
    const emp = await seedEmployee();
    const res = await request(app)
      .post(`/api/employees/${emp.id}/closure`)
      .set('Authorization', `Bearer ${rhToken}`)
      .send(body());
    expect(res.status).toBe(201);
    expect(res.body.data.emailStatus).toBe('SENT');
    expect(res.body.data.smsStatus).toBe('SENT');
    expect(res.body.data.htmlSnapshot).toBeUndefined();

    const after = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(after?.status).toBe('INACTIF');
    expect(after?.terminationDate).toBeTruthy();
    expect(montrealYmd(after!.uniformReturnDeadlineAt!)).toBe(deadline);

    expect(sendEmailWithProvider).toHaveBeenCalledTimes(1);
    const mail = sendEmailWithProvider.mock.calls[0][0];
    expect(mail.to).toBe('jean@example.com');
    expect(mail.cc).toEqual(['paie@xguard.ca', 'rh@xguard.ca']);
    expect(mail.replyTo).toBe('rh@xguard.ca');
    expect(mail.contactId).toBe('contact-upserted');
    expect(sendSms).toHaveBeenCalledWith('contact-upserted', expect.stringContaining('105,00 $'));

    const notice = await prisma.employeeOffboardingNotice.findFirst({ where: { employeeId: emp.id } });
    expect(Number(notice?.estimatedAmount)).toBe(105);
    expect(notice?.htmlSnapshot).toContain('105,00 $');
    expect(notice?.sentByName).toBe('Tamara Hadid');

    // Les remises actives ont reçu la date limite.
    const iss = await prisma.uniformIssuance.findFirst({ where: { employeeId: emp.id } });
    expect(iss?.dueReturnAt?.toISOString()).toBe(after!.uniformReturnDeadlineAt!.toISOString());

    const overview = await request(app).get(`/api/employees/${emp.id}/closure`).set('Authorization', `Bearer ${rhToken}`);
    expect(overview.body.data.tracking.status).toBe('EN_ATTENTE');
    expect(overview.body.data.tracking.daysLeft).toBe(14);
  });

  it('échec du courriel : le dossier est quand même fermé, l’erreur est gardée, puis « Renvoyer » réussit', async () => {
    const emp = await seedEmployee();
    sendEmailWithProvider.mockRejectedValueOnce(new Error('GHL email échoué : quota'));
    const res = await request(app)
      .post(`/api/employees/${emp.id}/closure`)
      .set('Authorization', `Bearer ${rhToken}`)
      .send(body({ sendSms: false }));
    expect(res.status).toBe(201);
    expect(res.body.data.emailStatus).toBe('FAILED');
    expect(res.body.data.emailError).toContain('quota');
    expect(res.body.data.smsStatus).toBe('SKIPPED');
    expect((await prisma.employee.findUnique({ where: { id: emp.id } }))?.status).toBe('INACTIF');

    const resend = await request(app)
      .post(`/api/employees/${emp.id}/closure/${res.body.data.id}/resend`)
      .set('Authorization', `Bearer ${rhToken}`);
    expect(resend.status).toBe(200);
    expect(resend.body.data.emailStatus).toBe('SENT');
    expect(resend.body.data.emailError).toBeNull();
    expect(sendSms).not.toHaveBeenCalled(); // texto jamais demandé → pas renvoyé
  });

  it('sans courriel au dossier : courriel SKIPPED, texto envoyé quand même', async () => {
    const emp = await seedEmployee({ email: null });
    const res = await request(app)
      .post(`/api/employees/${emp.id}/closure`)
      .set('Authorization', `Bearer ${rhToken}`)
      .send(body());
    expect(res.status).toBe(201);
    expect(res.body.data.emailStatus).toBe('SKIPPED');
    expect(res.body.data.smsStatus).toBe('SENT');
    expect(sendEmailWithProvider).not.toHaveBeenCalled();
  });

  it('sans uniformes : lettre sans montant, suivi « aucun uniforme »', async () => {
    const emp = await seedEmployee({ withUniform: false });
    const res = await request(app)
      .post(`/api/employees/${emp.id}/closure`)
      .set('Authorization', `Bearer ${rhToken}`)
      .send(body({ sendSms: false }));
    expect(res.status).toBe(201);
    const html = sendEmailWithProvider.mock.calls[0][0].html as string;
    expect(html).not.toContain('sera déduit de votre paie');
    const overview = await request(app).get(`/api/employees/${emp.id}/closure`).set('Authorization', `Bearer ${rhToken}`);
    expect(overview.body.data.tracking.status).toBe('AUCUN_UNIFORME');
  });

  it('validation : date passée → 400 ; motif inconnu → 400 ; rôle lecture seule → 403', async () => {
    const emp = await seedEmployee();
    const past = await request(app)
      .post(`/api/employees/${emp.id}/closure`)
      .set('Authorization', `Bearer ${rhToken}`)
      .send(body({ deadline: '2020-01-01' }));
    expect(past.status).toBe(400);
    const badReason = await request(app)
      .post(`/api/employees/${emp.id}/closure`)
      .set('Authorization', `Bearer ${rhToken}`)
      .send(body({ reason: 'AUTRE' }));
    expect(badReason.status).toBe(400);
    const forbidden = await request(app)
      .post(`/api/employees/${emp.id}/closure`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send(body());
    expect(forbidden.status).toBe(403);
    expect((await prisma.employee.findUnique({ where: { id: emp.id } }))?.status).toBe('ACTIF');
  });
});
