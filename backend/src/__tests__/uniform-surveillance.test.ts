import { prisma, cleanDatabase } from './setup';
import { checkInactiveEmployeesWithHoldings } from '../jobs/uniform-surveillance';
import { computeHoldings, computeAmountOwed } from '../services/uniform-stock.service';
import { closeTerminationCore } from '../services/uniform-termination.service';
import { addBusinessDays } from '../utils/business-days';

/**
 * Surveillance offboarding — checkInactiveEmployeesWithHoldings.
 *
 * On appelle le check DIRECTEMENT (pas via HTTP) et on observe ses effets en
 * base : notifications créées (PENDING — aucun envoi réseau, le dispatch est un
 * autre worker) et, après le délai de grâce, clôture AUTOMATIQUE des remises.
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
        terminationDate: deadline ? addBusinessDays(deadline, -5) : null,
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

  it('échéance future : 1 rappel RH ; idempotent (dedup par jour)', async () => {
    const future = addBusinessDays(new Date(), 30);
    await seedInactiveHolder({ phone: '4385550001', deadline: future, issuedQty: 2 });

    await checkInactiveEmployeesWithHoldings();
    let notifs = await prisma.notification.count({ where: { type: TYPE } });
    expect(notifs).toBe(1); // RH email (IN_APP sans userIds → 0)

    // 2ᵉ passage le même jour → dedupKey identique → aucune nouvelle ligne.
    await checkInactiveEmployeesWithHoldings();
    notifs = await prisma.notification.count({ where: { type: TYPE } });
    expect(notifs).toBe(1);
  });

  it('échéance dépassée (dans la grâce) + dette : alerte RH + PAIE', async () => {
    const pastDeadline = addBusinessDays(new Date(), -1); // dépassée mais grâce non écoulée
    await seedInactiveHolder({ phone: '4385550002', deadline: pastDeadline, issuedQty: 3, lostQty: 1, cost: 30 });

    await checkInactiveEmployeesWithHoldings();
    const notifs = await prisma.notification.findMany({ where: { type: TYPE } });
    // RH + PAIE (owed = 30 > 0).
    expect(notifs.length).toBe(2);
    expect(notifs.some((n) => (n.recipientEmail || '').includes('paie'))).toBe(true);
  });

  it('échéance + grâce dépassées : clôture AUTOMATIQUE (remise CLOSED_TERMINATION, détentions → 0)', async () => {
    const longPast = addBusinessDays(new Date(), -40); // échéance + 10j de grâce largement dépassés
    const { emp, iss } = await seedInactiveHolder({ phone: '4385550003', deadline: longPast, issuedQty: 2 });

    expect((await computeHoldings(emp.id)).length).toBeGreaterThan(0);

    await checkInactiveEmployeesWithHoldings();

    const closed = await prisma.uniformIssuance.findUnique({ where: { id: iss.id } });
    expect(closed?.status).toBe('CLOSED_TERMINATION');
    // Un retour NOT_RETURNED a été créé → détentions retombent à 0.
    expect(await computeHoldings(emp.id)).toHaveLength(0);
    // Notif de clôture émise vers RH ET PAIE (PAIE = moitié porteuse : prélèvement
    // sur la dernière paie), avec le montant dû figé (NOT_RETURNED = 2 × 30).
    const closedNotifs = await prisma.notification.findMany({ where: { type: 'UNIFORM_TERMINATION_CLOSED' } });
    expect(closedNotifs.some((n) => (n.recipientEmail || '').includes('rh'))).toBe(true);
    const paie = closedNotifs.find((n) => (n.recipientEmail || '').includes('paie'));
    expect(paie).toBeDefined();
    expect((paie?.payload as any)?.amountOwed).toBe(60);
  });

  it('échéance manquante (données héritées) : rétablit l’échéance + persiste, rappel RH, pas de clôture', async () => {
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

    // Échéance rétablie et PERSISTÉE (sinon dead-end : rappel quotidien sans escalade).
    const after = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(after?.uniformReturnDeadlineAt).toBeTruthy();
    expect(after?.terminationDate).toBeTruthy();
    // Échéance future (ancre = maintenant + 5 j ouvr.) → rappel RH, pas de clôture.
    expect(await prisma.notification.count({ where: { type: TYPE } })).toBe(1);
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
