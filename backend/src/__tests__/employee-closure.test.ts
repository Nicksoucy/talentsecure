import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';
import { addDaysYmd, endOfDayMontreal, montrealYmd } from '../utils/montreal-date';
import { buildClosureSms } from '../services/employee-file-closure.service';

// Réseau simulé : courriel (fournisseur), contact GHL et texto.
const sendEmailWithProvider = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/notification.service', () => ({
  ...jest.requireActual('../services/notification.service'),
  sendEmailWithProvider: (...args: unknown[]) => sendEmailWithProvider(...args),
}));
const sendSms = jest.fn().mockResolvedValue({ messageId: 'sms-1' });
const resolveGhlContactId = jest.fn().mockResolvedValue('contact-by-phone');
jest.mock('../services/sms.service', () => ({
  resolveGhlContactId: (...args: unknown[]) => resolveGhlContactId(...args),
  sendSms: (...args: unknown[]) => sendSms(...args),
}));
// Numéro inscrit sur la fiche GHL trouvée (par défaut = celui de la fiche TalentSecure).
const getContactById = jest.fn().mockResolvedValue({ id: 'contact-by-phone', phone: '+15145550000' });
jest.mock('../services/ghl.client', () => ({
  ...jest.requireActual('../services/ghl.client'),
  getContactById: (...args: unknown[]) => getContactById(...args),
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
describe('buildClosureSms — texte des RH (2026-09-30)', () => {
  it('reprend mot pour mot le texte fourni par les RH', () => {
    expect(buildClosureSms({ firstName: 'Nicolas', deadline: endOfDayMontreal('2026-09-30'), total: 40, hasPieces: true })).toBe(
      "Sécurité XGuard : Bonjour Nicolas, votre dossier est maintenant fermé. Merci de rapporter vos uniformes d'ici le 30 septembre " +
        "au 9380, boul. Saint-Laurent (lun. au ven., 9 h à 15 h 30) ou de nous les envoyer par la poste. Sans retour, 40 $ seront " +
        "déduits de votre paie, tel que convenu à l'embauche. Les détails vous ont été envoyés par courriel (pensez à vérifier vos " +
        'courriels indésirables).'
    );
  });

  it('« 1er » du mois, montant avec cents, et version sans uniformes', () => {
    const withCents = buildClosureSms({ firstName: 'Ana', deadline: endOfDayMontreal('2026-10-01'), total: 42.5, hasPieces: true });
    expect(withCents).toContain("d'ici le 1er octobre");
    expect(withCents).toContain('Sans retour, 42,50 $ seront déduits');
    const none = buildClosureSms({ firstName: 'Ana', deadline: endOfDayMontreal('2026-10-01'), total: 0, hasPieces: false });
    expect(none).not.toContain('déduits');
    expect(none).toContain('tout bien de la Compagnie');
  });

  it('uniformes reçus : confirmation datée, rien à rapporter', () => {
    expect(
      buildClosureSms({ firstName: 'Jean', deadline: endOfDayMontreal('2026-10-22'), total: 0, hasPieces: false, receivedAt: new Date('2026-10-08T15:00:00Z') })
    ).toBe(
      'Sécurité XGuard : Bonjour Jean, votre dossier est maintenant fermé. Nous confirmons la réception de vos uniformes le 8 octobre : ' +
        'aucun montant ne sera retenu sur votre paie. Les détails vous ont été envoyés par courriel (pensez à vérifier vos courriels indésirables).'
    );
  });
});

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
    resolveGhlContactId.mockClear().mockResolvedValue('contact-by-phone');
    getContactById.mockClear().mockResolvedValue({ id: 'contact-by-phone', phone: '+15145550000' });
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
    expect(sms).toContain('Sans retour, 105 $ seront déduits de votre paie, tel que convenu à l\'embauche.');
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
    // Texto : contact retrouvé par le NUMÉRO de la fiche, jamais par le courriel.
    expect(resolveGhlContactId).toHaveBeenCalledWith('5145550000', null);
    expect(sendSms).toHaveBeenCalledWith('contact-by-phone', expect.stringContaining('105 $ seront déduits'));

    const notice = await prisma.employeeOffboardingNotice.findFirst({ where: { employeeId: emp.id } });
    expect(Number(notice?.estimatedAmount)).toBe(105);
    expect(notice?.htmlSnapshot).toContain('105,00 $');
    expect(notice?.sentByName).toBe('Tamara Hadid');

    // Registre : la fermeture est inscrite au nom de la personne.
    const history = await request(app).get(`/api/employees/${emp.id}/history`).set('Authorization', `Bearer ${rhToken}`);
    expect(history.body.data).toEqual([
      expect.objectContaining({ by: 'Tamara Hadid', details: expect.stringMatching(/^Dossier fermé \(.+\) — retour des uniformes au plus tard le /) }),
    ]);

    // Les remises actives ont reçu la date limite.
    const iss = await prisma.uniformIssuance.findFirst({ where: { employeeId: emp.id } });
    expect(iss?.dueReturnAt?.toISOString()).toBe(after!.uniformReturnDeadlineAt!.toISOString());

    const overview = await request(app).get(`/api/employees/${emp.id}/closure`).set('Authorization', `Bearer ${rhToken}`);
    expect(overview.body.data.tracking.status).toBe('EN_ATTENTE');
    expect(overview.body.data.tracking.daysLeft).toBe(14);

    // Règle RH : il rapporte 1 chemise sur 3 → retour complet, suivi « Rapporté ».
    const line = await prisma.uniformIssuanceLine.findFirst({ where: { issuanceId: iss!.id } });
    await prisma.uniformReturn.create({
      data: {
        issuanceId: iss!.id, employeeId: emp.id, status: 'RETURNED', returnedAt: new Date(),
        lines: { create: [{ variantId: line!.variantId, quantity: 1, condition: 'GOOD', unitReplacementCost: 0 }] },
      },
    });
    const later = await request(app).get(`/api/employees/${emp.id}/closure`).set('Authorization', `Bearer ${rhToken}`);
    expect(later.body.data.tracking.status).toBe('RAPPORTE');
    expect(later.body.data.tracking.daysLeft).toBeNull();
  });

  it('texto : si la fiche GHL a un autre numéro que TalentSecure, on N’ENVOIE PAS (bogue du 30 sept)', async () => {
    const emp = await seedEmployee();
    getContactById.mockResolvedValue({ id: 'contact-by-phone', phone: '+15147007521' });
    const res = await request(app)
      .post(`/api/employees/${emp.id}/closure`)
      .set('Authorization', `Bearer ${rhToken}`)
      .send(body());
    expect(res.status).toBe(201);
    expect(res.body.data.emailStatus).toBe('SENT');
    expect(res.body.data.smsStatus).toBe('FAILED');
    expect(res.body.data.smsError).toContain('autre numéro');
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('texto : numéro inconnu de GHL → contact créé avec le numéro de la fiche seulement', async () => {
    const emp = await seedEmployee();
    resolveGhlContactId.mockResolvedValue(null);
    const { upsertPersonContact } = jest.requireMock('../services/ghl-email.service');
    (upsertPersonContact as jest.Mock).mockClear();
    getContactById.mockResolvedValue({ id: 'contact-upserted', phone: '+15145550000' });
    const res = await request(app)
      .post(`/api/employees/${emp.id}/closure`)
      .set('Authorization', `Bearer ${rhToken}`)
      .send(body());
    expect(res.body.data.smsStatus).toBe('SENT');
    const calls = (upsertPersonContact as jest.Mock).mock.calls.map((c) => c[0]);
    // Courriel : par l'adresse seulement (on n'écrase pas le numéro d'une fiche existante).
    expect(calls).toContainEqual(expect.objectContaining({ email: 'jean@example.com' }));
    expect(calls.find((c) => c.email)).not.toHaveProperty('phone');
    // Texto : par le numéro seulement.
    expect(calls).toContainEqual(expect.objectContaining({ phone: '5145550000' }));
    expect(calls.find((c) => c.phone)).not.toHaveProperty('email');
    expect(sendSms).toHaveBeenCalledWith('contact-upserted', expect.any(String));
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

  describe('case « Uniformes reçus »', () => {
    it('lettre et texto CONFIRMENT la réception en date du jour ; rien à retenir ; registre', async () => {
      const emp = await seedEmployee({ withUniform: false });
      const preview = await request(app)
        .post(`/api/employees/${emp.id}/closure/preview`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send(body({ uniformsReceived: true }));
      expect(preview.status).toBe(200);
      expect(preview.body.data.html).toContain('Nous confirmons avoir reçu vos uniformes');
      expect(preview.body.data.html).not.toContain('Vous devez retourner');
      expect(preview.body.data.html).toContain('Réception des biens de la Compagnie');
      expect(preview.body.data.sms).toContain('Nous confirmons la réception de vos uniformes le');
      expect(preview.body.data.sms).not.toContain('Merci de rapporter');

      const res = await request(app)
        .post(`/api/employees/${emp.id}/closure`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send(body({ uniformsReceived: true }));
      expect(res.status).toBe(201);
      const mail = sendEmailWithProvider.mock.calls[0][0];
      expect(mail.cc).toEqual(['paie@xguard.ca', 'rh@xguard.ca']);
      expect(mail.html).toContain('Aucun montant ne sera retenu sur votre paie pour les uniformes');
      expect(sendSms).toHaveBeenCalledWith('contact-by-phone', expect.stringContaining('aucun montant ne sera retenu'));
      const log = await prisma.auditLog.findFirst({ where: { resourceId: emp.id } });
      expect(log?.details).toMatch(/^Dossier fermé \(Inactivité\) — réception des uniformes confirmée le .+, rien à retenir$/);
    });

    it('refusé si le système montre encore des pièces : rien n’est fermé ni envoyé', async () => {
      const emp = await seedEmployee();
      const res = await request(app)
        .post(`/api/employees/${emp.id}/closure`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send(body({ uniformsReceived: true }));
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('3 pièce(s)');
      expect((await prisma.employee.findUnique({ where: { id: emp.id } }))?.status).toBe('ACTIF');
      expect(sendEmailWithProvider).not.toHaveBeenCalled();
    });
  });

  describe('fermer SANS rien envoyer', () => {
    const silent = (id: string, payload: Record<string, unknown>, token = rhToken) =>
      request(app).post(`/api/employees/${id}/closure/silent`).set('Authorization', `Bearer ${token}`).send(payload);

    it('uniformes déjà rapportés : Inactif, aucun courriel ni texto, aucun avis, trace au registre', async () => {
      const emp = await seedEmployee({ withUniform: false });
      const res = await silent(emp.id, { reason: 'DEMISSION' });
      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({ becameInactive: true, piecesHeld: 0, payrollNotified: false });

      const after = await prisma.employee.findUnique({ where: { id: emp.id } });
      expect(after?.status).toBe('INACTIF');
      expect(after?.terminationDate).toBeTruthy();
      expect(sendEmailWithProvider).not.toHaveBeenCalled();
      expect(sendSms).not.toHaveBeenCalled();
      expect(await prisma.employeeOffboardingNotice.count({ where: { employeeId: emp.id } })).toBe(0);
      expect(await prisma.notification.count({ where: { payload: { path: ['employeeId'], equals: emp.id } } })).toBe(0);

      const history = await request(app).get(`/api/employees/${emp.id}/history`).set('Authorization', `Bearer ${rhToken}`);
      expect(history.body.data).toEqual([
        expect.objectContaining({ by: 'Tamara Hadid', details: 'Dossier fermé sans avis à l’employé (Démission) — rien n’a été envoyé' }),
      ]);
    });

    it('pièces encore détenues : fermé quand même, date limite posée et notée au registre', async () => {
      const emp = await seedEmployee();
      const res = await silent(emp.id, { reason: 'FIN_EMPLOI', deadline });
      expect(res.status).toBe(201);
      expect(res.body.data.piecesHeld).toBe(3);
      const after = await prisma.employee.findUnique({ where: { id: emp.id } });
      expect(montrealYmd(after!.uniformReturnDeadlineAt!)).toBe(deadline);
      expect(sendEmailWithProvider).not.toHaveBeenCalled();
      const log = await prisma.auditLog.findFirst({ where: { resourceId: emp.id } });
      expect(log?.details).toMatch(/3 pièce\(s\) d’uniforme encore détenue\(s\), date limite/);
    });

    it('aviser la paie : courriel À paie CC RH « rien à retenir », note incluse, rien à l’employé', async () => {
      const emp = await seedEmployee({ withUniform: false });
      const res = await silent(emp.id, { reason: 'DEMISSION', notifyPayroll: true, note: 'Ne pas retenir les 50 $.' });
      expect(res.status).toBe(201);
      expect(res.body.data.payrollNotified).toBe(true);
      expect(sendEmailWithProvider).not.toHaveBeenCalled();
      expect(sendSms).not.toHaveBeenCalled();

      const mails = await prisma.notification.findMany({ where: { channel: 'EMAIL', payload: { path: ['employeeId'], equals: emp.id } } });
      expect(mails).toHaveLength(1);
      expect(mails[0].recipientEmail).toBe('paie@xguard.ca');
      expect(mails[0].title).toContain('uniformes retournés, rien à retenir');
      const payload = mails[0].payload as any;
      expect(payload.emailCc).toEqual(['rh@xguard.ca']);
      expect(payload.amountToWithhold).toBe(0);
      expect(payload.emailHtml).toContain('Rien à retenir sur la paie');
      expect(payload.emailHtml).toContain('Ne pas retenir les 50 $.');
      expect(payload.emailHtml).toContain('Fermé par Tamara Hadid');

      const log = await prisma.auditLog.findFirst({ where: { resourceId: emp.id } });
      expect(log?.details).toBe('Dossier fermé sans avis à l’employé (Démission) — courriel à la paie (RH en copie)');
    });

    it('aviser la paie avec pièces encore détenues : liste + date limite, rien à retenir pour l’instant', async () => {
      const emp = await seedEmployee();
      await silent(emp.id, { reason: 'FIN_EMPLOI', deadline, notifyPayroll: true });
      const mail = await prisma.notification.findFirst({ where: { channel: 'EMAIL', payload: { path: ['employeeId'], equals: emp.id } } });
      expect(mail?.title).toContain('3 pièce(s) d’uniforme encore détenue(s)');
      expect((mail?.payload as any).emailHtml).toContain('105,00 $');
    });

    it('validation : motif inconnu → 400 ; champ en trop → 400 ; lecture seule → 403', async () => {
      const emp = await seedEmployee({ withUniform: false });
      expect((await silent(emp.id, { reason: 'AUTRE' })).status).toBe(400);
      expect((await silent(emp.id, { reason: 'DEMISSION', sendSms: true })).status).toBe(400);
      expect((await silent(emp.id, { reason: 'DEMISSION' }, salesToken)).status).toBe(403);
      expect((await prisma.employee.findUnique({ where: { id: emp.id } }))?.status).toBe('ACTIF');
    });
  });
});
