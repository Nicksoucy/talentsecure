import { prisma, cleanDatabase } from './setup';
import { checkInactiveEmployeesWithHoldings } from '../jobs/uniform-surveillance';
import { computeHoldings, computeAmountOwed } from '../services/uniform-stock.service';
import { closeTerminationCore } from '../services/uniform-termination.service';

/**
 * Surveillance offboarding — checkInactiveEmployeesWithHoldings.
 *
 * On appelle le check DIRECTEMENT (pas via HTTP) et on observe ses effets en
 * base : notifications créées (PENDING — aucun envoi réseau, le dispatch est un
 * autre worker) et, dès l'échéance dépassée, clôture AUTOMATIQUE des remises.
 *
 * `notification.service` n'est PAS mocké : on veut vérifier les vraies lignes
 * `notifications`. `notify()` ne fait que des INSERT (idempotents par dedupKey) ;
 * l'envoi courriel réel n'a lieu qu'au dispatch, jamais déclenché ici.
 *
 * Isolation : cleanDatabase() en beforeEach car le check scanne TOUS les
 * employés INACTIF de la base.
 */
describe('Surveillance offboarding — checkInactiveEmployeesWithHoldings', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  // Crée un ex-employé INACTIF détenant `issuedQty - lostQty` pièces.
  // Si lostQty > 0, une perte est enregistrée (dette = lostQty × cost).
  async function seedInactiveHolder(opts: {
    phone: string;
    deadline: Date | null;
    issuedQty?: number;
    lostQty?: number;
    cost?: number;
  }) {
    const { phone, deadline, issuedQty = 2, lostQty = 0, cost = 30 } = opts;
    const emp = await prisma.employee.create({
      data: {
        firstName: 'Anc', lastName: phone, phone, status: 'INACTIF',
        terminationDate: deadline ? new Date(deadline.getTime() - 14 * 86_400_000) : null,
        uniformReturnDeadlineAt: deadline,
      },
    });
    const item = await prisma.uniformItem.create({
      data: { division: 'SECURITE', name: `Chemise ${phone}`, defaultReplacementCost: cost },
    });
    const variant = await prisma.uniformVariant.create({
      data: { itemId: item.id, size: 'M', barcode: `SURV-${phone}`, replacementCost: cost },
    });
    const iss = await prisma.uniformIssuance.create({
      data: {
        employeeId: emp.id, division: 'SECURITE', status: 'ISSUED',
        lines: { create: [{ variantId: variant.id, quantity: issuedQty, unitCostSnapshot: cost }] },
      },
    });
    if (lostQty > 0) {
      await prisma.uniformReturn.create({
        data: {
          issuanceId: iss.id, employeeId: emp.id, status: 'RETURNED', returnedAt: new Date(),
          lines: { create: [{ variantId: variant.id, quantity: lostQty, condition: 'LOST', unitReplacementCost: cost }] },
        },
      });
    }
    return { emp, variant, iss };
  }

  const TYPE = 'UNIFORM_INACTIVE_EMPLOYEE_HAS_HOLDINGS';

  async function seedAdmin() {
    return prisma.user.create({
      data: { email: `admin-${Date.now()}@test.local`, firstName: 'Ad', lastName: 'Min', role: 'ADMIN' },
    });
  }

  it('échéance dans plus d’un jour : aucun avis (pas de courriel quotidien)', async () => {
    await seedAdmin();
    const future = new Date(Date.now() + 5 * 24 * 3600 * 1000);
    await seedInactiveHolder({ phone: '4385550001', deadline: future, issuedQty: 2 });

    await checkInactiveEmployeesWithHoldings();
    expect(await prisma.notification.count({ where: { type: TYPE } })).toBe(0);
  });

  it('veille de l’échéance : 1 rappel dans l’app (RH/admins), une seule fois', async () => {
    await seedAdmin();
    const tomorrow = new Date(Date.now() + 12 * 3600 * 1000);
    await seedInactiveHolder({ phone: '4385550002', deadline: tomorrow, issuedQty: 2 });

    await checkInactiveEmployeesWithHoldings();
    await checkInactiveEmployeesWithHoldings();
    const notifs = await prisma.notification.findMany({ where: { type: TYPE } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].channel).toBe('IN_APP');
  });

  it('échéance dépassée (dès le lendemain) : clôture AUTOMATIQUE + courriel PAIE (CC RH) avec pièces et montant', async () => {
    await seedAdmin();
    const justPast = new Date(Date.now() - 60 * 1000);
    const { emp, iss } = await seedInactiveHolder({ phone: '4385550003', deadline: justPast, issuedQty: 2 });

    expect((await computeHoldings(emp.id)).length).toBeGreaterThan(0);

    await checkInactiveEmployeesWithHoldings();

    const closed = await prisma.uniformIssuance.findUnique({ where: { id: iss.id } });
    expect(closed?.status).toBe('CLOSED_TERMINATION');
    expect(await computeHoldings(emp.id)).toHaveLength(0);

    const closedNotifs = await prisma.notification.findMany({ where: { type: 'UNIFORM_TERMINATION_CLOSED' } });
    // Un seul courriel : à la paie, RH en copie (plus de courriel RH séparé).
    const emails = closedNotifs.filter((n) => n.channel === 'EMAIL');
    expect(emails).toHaveLength(1);
    expect(emails[0].recipientEmail).toContain('paie');
    const payload = emails[0].payload as any;
    expect(payload.amountOwed).toBe(60);
    expect(payload.emailCc).toEqual([expect.stringContaining('rh')]);
    expect(payload.emailHtml).toContain('Chemise 4385550003');
    expect(payload.emailHtml).toContain('60,00 $');
    expect(payload.emailHtml).not.toContain('localhost');
    // Alerte dans l'app pour les admins.
    expect(closedNotifs.some((n) => n.channel === 'IN_APP')).toBe(true);
  });

  it('échéance manquante (données héritées) : rétablit l’échéance (+14 j) + persiste, pas de clôture', async () => {
    // INACTIF sans terminationDate ni uniformReturnDeadlineAt (créé en direct /
    // antérieur à la feature) mais détenant des pièces.
    const emp = await prisma.employee.create({
      data: { firstName: 'Leg', lastName: 'Acy', phone: '4385550006', status: 'INACTIF' },
    });
    const item = await prisma.uniformItem.create({ data: { division: 'SECURITE', name: 'Chemise legacy', defaultReplacementCost: 30 } });
    const variant = await prisma.uniformVariant.create({ data: { itemId: item.id, size: 'M', barcode: 'SURV-LEG', replacementCost: 30 } });
    const iss = await prisma.uniformIssuance.create({
      data: { employeeId: emp.id, division: 'SECURITE', status: 'ISSUED', lines: { create: [{ variantId: variant.id, quantity: 1, unitCostSnapshot: 30 }] } },
    });

    await checkInactiveEmployeesWithHoldings();

    const after = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(after?.terminationDate).toBeTruthy();
    const days = (after!.uniformReturnDeadlineAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13);
    expect(days).toBeLessThan(15.1);
    const stillOpen = await prisma.uniformIssuance.findUnique({ where: { id: iss.id } });
    expect(stillOpen?.status).toBe('ISSUED');
  });

  it('employé ACTIF ou ancien sans détention : aucune notification', async () => {
    // ACTIF avec pièces.
    const actif = await prisma.employee.create({
      data: { firstName: 'Tou', lastName: 'Jours', phone: '4385550004', status: 'ACTIF' },
    });
    const item = await prisma.uniformItem.create({ data: { division: 'SECURITE', name: 'Chemise actif', defaultReplacementCost: 30 } });
    const variant = await prisma.uniformVariant.create({ data: { itemId: item.id, size: 'M', barcode: 'SURV-ACTIF', replacementCost: 30 } });
    await prisma.uniformIssuance.create({
      data: { employeeId: actif.id, division: 'SECURITE', status: 'ISSUED', lines: { create: [{ variantId: variant.id, quantity: 1, unitCostSnapshot: 30 }] } },
    });
    // INACTIF sans pièces.
    await prisma.employee.create({ data: { firstName: 'Rien', lastName: 'Dû', phone: '4385550005', status: 'INACTIF' } });

    await checkInactiveEmployeesWithHoldings();
    expect(await prisma.notification.count({ where: { type: TYPE } })).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // closeTerminationCore — idempotence & cas limites (appel direct du service)
  // ---------------------------------------------------------------------------
  describe('closeTerminationCore', () => {
    const load = (id: string) =>
      prisma.uniformIssuance.findUnique({
        where: { id },
        include: { lines: { include: { variant: true } }, returns: { include: { lines: true } } },
      });

    it('2ᵉ passe sur une remise déjà clôturée → null, aucun 2ᵉ retour (idempotent)', async () => {
      const { iss } = await seedInactiveHolder({ phone: '4385550010', deadline: new Date(), issuedQty: 2 });
      const first = await closeTerminationCore((await load(iss.id))!, null);
      expect(first).not.toBeNull();
      const second = await closeTerminationCore((await load(iss.id))!, null);
      expect(second).toBeNull();
      expect(await prisma.uniformReturn.count({ where: { issuanceId: iss.id } })).toBe(1);
    });

    it('toutes les pièces déjà retournées (GOOD) : clôture sans dette (0 ligne, owed 0)', async () => {
      const { emp, iss, variant } = await seedInactiveHolder({ phone: '4385550011', deadline: new Date(), issuedQty: 2 });
      await prisma.uniformReturn.create({
        data: {
          issuanceId: iss.id, employeeId: emp.id, status: 'RETURNED', returnedAt: new Date(),
          lines: { create: [{ variantId: variant.id, quantity: 2, condition: 'GOOD', unitReplacementCost: 30 }] },
        },
      });
      const res = await closeTerminationCore((await load(iss.id))!, null);
      expect(res).not.toBeNull();
      const closeReturn = await prisma.uniformReturn.findUnique({ where: { id: res!.returnId }, include: { lines: true } });
      expect(closeReturn?.lines).toHaveLength(0);
      expect((await computeAmountOwed(emp.id)).owed).toBe(0);
      expect((await load(iss.id))?.status).toBe('CLOSED_TERMINATION');
    });
  });
});
