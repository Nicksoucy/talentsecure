import { prisma, cleanDatabase } from './setup';
import {
  buildDeactivationFields,
  defaultReturnDeadline,
  estimateHoldingsCost,
  propagateUniformOffboarding,
  revertUniformOffboarding,
} from '../services/employee-offboarding.service';

/**
 * Service partagé de transition ACTIF↔INACTIF (employee-offboarding.service) —
 * utilisé par le contrôleur (PUT /api/employees/:id, couvert par employee.test.ts)
 * ET par le script d'import Agendrix (désactivations en lot). Ici : les ancres
 * pures + les deux effets uniformes en accès direct service.
 */
describe('employee-offboarding.service', () => {
  describe('buildDeactivationFields (pur)', () => {
    it('pose fin d’emploi = maintenant et échéance = +14 jours, fin de journée à Montréal', () => {
      const now = new Date('2026-09-29T16:00:00.000Z'); // 29 sept, midi à Montréal
      const fields = buildDeactivationFields({ terminationDate: null, uniformReturnDeadlineAt: null }, now);
      expect(fields.terminationDate).toEqual(now);
      // 13 octobre 23:59:59.999 EDT = 14 octobre 03:59:59.999 UTC
      expect(fields.uniformReturnDeadlineAt.toISOString()).toBe('2026-10-14T03:59:59.999Z');
    });

    it('le jour civil de départ est celui de Montréal (soir = même jour, pas le lendemain UTC)', () => {
      // 29 sept 22h à Montréal = 30 sept 02h UTC → départ = 29 sept
      expect(defaultReturnDeadline(new Date('2026-09-30T02:00:00.000Z')).toISOString()).toBe(
        '2026-10-14T03:59:59.999Z'
      );
      // Heure normale (hiver) : fin de journée = 04:59:59.999 UTC
      expect(defaultReturnDeadline(new Date('2026-11-20T17:00:00.000Z')).toISOString()).toBe(
        '2026-12-05T04:59:59.999Z'
      );
    });

    it('une date choisie par RH remplace même une échéance déjà posée', () => {
      const chosen = new Date('2026-10-20T03:59:59.999Z');
      const fields = buildDeactivationFields(
        { terminationDate: null, uniformReturnDeadlineAt: new Date('2026-10-01T00:00:00.000Z') },
        new Date('2026-09-29T16:00:00.000Z'),
        chosen
      );
      expect(fields.uniformReturnDeadlineAt).toEqual(chosen);
    });

    it('préserve des ancres déjà posées (réenregistrement idempotent)', () => {
      const term = new Date('2026-01-05T00:00:00.000Z');
      const dead = new Date('2026-01-12T00:00:00.000Z');
      const fields = buildDeactivationFields(
        { terminationDate: term, uniformReturnDeadlineAt: dead },
        new Date('2026-07-17T12:00:00.000Z')
      );
      expect(fields.terminationDate).toEqual(term);
      expect(fields.uniformReturnDeadlineAt).toEqual(dead);
    });
  });

  describe('effets uniformes (DB)', () => {
    beforeAll(async () => {
      await cleanDatabase();
    });

    it('propagateUniformOffboarding sans pièces détenues → pas d’avertissement', async () => {
      const emp = await prisma.employee.create({
        data: { firstName: 'Sans', lastName: 'Pièces', phone: '5145557701', status: 'ACTIF' },
      });
      const warning = await propagateUniformOffboarding(emp.id, new Date('2026-07-24T12:00:00.000Z'));
      expect(warning).toBeUndefined();
    });

    it('propage l’échéance UNIQUEMENT aux remises actives sans date butoir + avertissement chiffré', async () => {
      const emp = await prisma.employee.create({
        data: { firstName: 'Avec', lastName: 'Pièces', phone: '5145557702', status: 'ACTIF' },
      });
      const item = await prisma.uniformItem.create({
        data: { division: 'SECURITE', name: 'Chemise OFF-SVC', defaultReplacementCost: 30 },
      });
      const variant = await prisma.uniformVariant.create({
        data: { itemId: item.id, size: 'M', barcode: 'OFF-SVC-1', replacementCost: 30 },
      });
      const manual = new Date('2099-03-03T12:00:00.000Z');
      const issNoDue = await prisma.uniformIssuance.create({
        data: {
          employeeId: emp.id, division: 'SECURITE', status: 'ISSUED', dueReturnAt: null,
          lines: { create: [{ variantId: variant.id, quantity: 2, unitCostSnapshot: 30 }] },
        },
      });
      const issManual = await prisma.uniformIssuance.create({
        data: {
          employeeId: emp.id, division: 'SECURITE', status: 'ISSUED', dueReturnAt: manual,
          lines: { create: [{ variantId: variant.id, quantity: 1, unitCostSnapshot: 30 }] },
        },
      });

      const deadline = new Date('2026-07-24T12:00:00.000Z');
      const warning = await propagateUniformOffboarding(emp.id, deadline);

      expect(warning).toBeDefined();
      expect(warning!.totalPieces).toBe(3);
      expect(warning!.activeIssuanceIds).toEqual(
        expect.arrayContaining([issNoDue.id, issManual.id])
      );
      const after1 = await prisma.uniformIssuance.findUnique({ where: { id: issNoDue.id } });
      const after2 = await prisma.uniformIssuance.findUnique({ where: { id: issManual.id } });
      expect(after1?.dueReturnAt?.toISOString()).toBe(deadline.toISOString());
      expect(after2?.dueReturnAt?.toISOString()).toBe(manual.toISOString()); // pas écrasée

      // revert : annule UNIQUEMENT l'échéance propagée, préserve la manuelle.
      await revertUniformOffboarding(emp.id, deadline);
      const reverted1 = await prisma.uniformIssuance.findUnique({ where: { id: issNoDue.id } });
      const reverted2 = await prisma.uniformIssuance.findUnique({ where: { id: issManual.id } });
      expect(reverted1?.dueReturnAt).toBeNull();
      expect(reverted2?.dueReturnAt?.toISOString()).toBe(manual.toISOString());
    });

    it('nouvelle échéance choisie par RH : les remises qui avaient l’ancienne la suivent', async () => {
      const emp = await prisma.employee.create({
        data: { firstName: 'Re', lastName: 'Date', phone: '5145557703', status: 'INACTIF' },
      });
      const item = await prisma.uniformItem.create({
        data: { division: 'SECURITE', name: 'Pantalon OFF-RD', defaultReplacementCost: 40 },
      });
      const variant = await prisma.uniformVariant.create({
        data: { itemId: item.id, size: '32', barcode: 'OFF-RD-1', replacementCost: 40 },
      });
      const oldDeadline = new Date('2026-10-01T03:59:59.999Z');
      const manual = new Date('2099-01-01T12:00:00.000Z');
      const propagated = await prisma.uniformIssuance.create({
        data: {
          employeeId: emp.id, division: 'SECURITE', status: 'ISSUED', dueReturnAt: oldDeadline,
          lines: { create: [{ variantId: variant.id, quantity: 1, unitCostSnapshot: 40 }] },
        },
      });
      const fixed = await prisma.uniformIssuance.create({
        data: {
          employeeId: emp.id, division: 'SECURITE', status: 'ISSUED', dueReturnAt: manual,
          lines: { create: [{ variantId: variant.id, quantity: 1, unitCostSnapshot: 40 }] },
        },
      });

      const newDeadline = new Date('2026-10-14T03:59:59.999Z');
      await propagateUniformOffboarding(emp.id, newDeadline, oldDeadline);

      const a = await prisma.uniformIssuance.findUnique({ where: { id: propagated.id } });
      const b = await prisma.uniformIssuance.findUnique({ where: { id: fixed.id } });
      expect(a?.dueReturnAt?.toISOString()).toBe(newDeadline.toISOString());
      expect(b?.dueReturnAt?.toISOString()).toBe(manual.toISOString());
    });

    it('estimateHoldingsCost : coût figé sur la remise (pas le coût courant) et remises sans pièces signalées', async () => {
      const emp = await prisma.employee.create({
        data: { firstName: 'Est', lastName: 'Imation', phone: '5145557704', status: 'ACTIF' },
      });
      const item = await prisma.uniformItem.create({
        data: { division: 'SECURITE', name: 'Manteau OFF-EST', defaultReplacementCost: 90 },
      });
      // Coût courant 90 $, mais la remise a figé 75 $ : c'est 75 $ qui sera retenu.
      const variant = await prisma.uniformVariant.create({
        data: { itemId: item.id, size: 'L', barcode: 'OFF-EST-1', replacementCost: 90 },
      });
      await prisma.uniformIssuance.create({
        data: {
          employeeId: emp.id, division: 'SECURITE', status: 'ISSUED',
          lines: { create: [{ variantId: variant.id, quantity: 2, unitCostSnapshot: 75 }] },
        },
      });
      await prisma.uniformIssuance.create({
        data: { employeeId: emp.id, division: 'SECURITE', status: 'ISSUED' },
      });

      const est = await estimateHoldingsCost(emp.id);
      expect(est.totalPieces).toBe(2);
      expect(est.total).toBe(150);
      expect(est.pieces).toEqual([
        { itemName: 'Manteau OFF-EST', size: 'L', quantity: 2, unitCost: 75, lineTotal: 150 },
      ]);
      expect(est.issuancesWithoutLines).toBe(1);
    });
  });
});
