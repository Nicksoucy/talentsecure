import { prisma, cleanDatabase } from './setup';
import {
  buildDeactivationFields,
  propagateUniformOffboarding,
  revertUniformOffboarding,
} from '../services/employee-offboarding.service';
import { UNIFORM_RETURN_DEADLINE_BUSINESS_DAYS } from '../constants/uniform';
import { addBusinessDays } from '../utils/business-days';

/**
 * Service partagé de transition ACTIF↔INACTIF (employee-offboarding.service) —
 * utilisé par le contrôleur (PUT /api/employees/:id, couvert par employee.test.ts)
 * ET par le script d'import Agendrix (désactivations en lot). Ici : les ancres
 * pures + les deux effets uniformes en accès direct service.
 */
describe('employee-offboarding.service', () => {
  describe('buildDeactivationFields (pur)', () => {
    it('pose fin d’emploi = maintenant et échéance = +5 jours ouvrables', () => {
      const now = new Date('2026-07-17T12:00:00.000Z');
      const fields = buildDeactivationFields({ terminationDate: null, uniformReturnDeadlineAt: null }, now);
      expect(fields.terminationDate).toEqual(now);
      expect(fields.uniformReturnDeadlineAt).toEqual(
        addBusinessDays(now, UNIFORM_RETURN_DEADLINE_BUSINESS_DAYS)
      );
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
  });
});
