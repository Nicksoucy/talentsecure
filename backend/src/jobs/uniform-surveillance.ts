/**
 * Job horaire de surveillance des conditions critiques du module uniformes.
 *
 * Chaque check est idempotent : utilise un dedupKey pour éviter les envois
 * en double. La plupart utilisent une clé incluant la date du jour pour
 * permettre une re-relance quotidienne si la condition persiste (ex: stock bas).
 */
import { prisma } from '../config/database';
import { notify } from '../services/notification.service';
import { computeAmountOwed } from '../services/uniform-stock.service';
import { businessDaysBetween } from '../utils/business-days';

const today = () => new Date().toISOString().split('T')[0];

// =============================================================================
// 1. Retours dus dans <24h ouvrables
// =============================================================================
export async function checkReturnsDueSoon(): Promise<number> {
  const now = new Date();
  // On scanne les issuances avec date butoir dans les prochaines 48h calendaires
  // (la précision business-days est gérée à la planification, ici on rattrape les
  // cas où la planification a été manquée — pas grave si doublé via dedupKey).
  const inTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const issuances = await prisma.uniformIssuance.findMany({
    where: {
      status: { in: ['ISSUED', 'PARTIALLY_RETURNED'] },
      dueReturnAt: { not: null, gte: now, lte: inTwoDays },
    },
    include: { lines: { include: { variant: { include: { item: true } } } } },
  });

  let count = 0;
  for (const iss of issuances) {
    const businessDaysToDue = businessDaysBetween(iss.dueReturnAt!, now);
    if (businessDaysToDue > 1) continue; // pas encore dans la fenêtre de 24h ouvrables
    const employee = await prisma.employee.findUnique({ where: { id: iss.employeeId } });
    const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : 'Agent';
    await notify({
      type: 'UNIFORM_RETURN_DUE_SOON',
      channels: ['EMAIL', 'IN_APP'],
      audience: 'RH',
      dedupKey: `due-soon-${iss.id}`,
      title: `Rappel : retour d'uniforme dans 24h ouvrables — ${employeeName}`,
      message: `Date butoir : ${iss.dueReturnAt!.toISOString().split('T')[0]} · Montant à risque : ${Number(iss.totalLoanCost).toFixed(2)} $`,
      link: `/employees/${iss.employeeId}`,
      payload: { issuanceId: iss.id, employeeId: iss.employeeId, dueReturnAt: iss.dueReturnAt!.toISOString(), totalLoanCost: Number(iss.totalLoanCost) },
    });
    count++;
  }
  return count;
}

// =============================================================================
// 2. Retours overdue (date butoir dépassée, pas de retour)
// =============================================================================
export async function checkReturnsOverdue(): Promise<number> {
  const now = new Date();
  const overdue = await prisma.uniformIssuance.findMany({
    where: {
      status: { in: ['ISSUED', 'PARTIALLY_RETURNED'] },
      dueReturnAt: { not: null, lt: now },
    },
    include: { lines: { include: { variant: { include: { item: true } } } } },
  });

  let count = 0;
  for (const iss of overdue) {
    const daysOverdue = businessDaysBetween(now, iss.dueReturnAt!);
    const employee = await prisma.employee.findUnique({ where: { id: iss.employeeId } });
    const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : 'Agent';
    await notify({
      type: 'UNIFORM_RETURN_OVERDUE',
      channels: ['EMAIL', 'IN_APP'],
      audience: 'RH',
      dedupKey: `overdue-${iss.id}`,
      title: `⚠️ Uniforme non retourné — ${employeeName}`,
      message: `Date butoir dépassée de ${daysOverdue} jour(s) ouvrable(s) · Montant à prélever : ${Number(iss.totalLoanCost).toFixed(2)} $`,
      link: `/employees/${iss.employeeId}`,
      payload: { issuanceId: iss.id, employeeId: iss.employeeId, daysOverdue, totalLoanCost: Number(iss.totalLoanCost) },
    });
    await notify({
      type: 'UNIFORM_RETURN_OVERDUE',
      channels: ['EMAIL'],
      audience: 'PAIE',
      dedupKey: `overdue-paie-${iss.id}`,
      title: `Prélèvement uniforme requis — ${employeeName}`,
      message: `Date butoir dépassée · Montant : ${Number(iss.totalLoanCost).toFixed(2)} $`,
      link: `/employees/${iss.employeeId}`,
      payload: { issuanceId: iss.id, employeeId: iss.employeeId, totalLoanCost: Number(iss.totalLoanCost) },
    });
    count++;
  }
  return count;
}

// =============================================================================
// 3. Lots de lavage stagnants
// =============================================================================
export async function checkWashBatchesStagnant(): Promise<number> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  const sent = await prisma.uniformWashBatch.findMany({
    where: { status: 'SENT_TO_LAUNDRY', sentAt: { lt: sevenDaysAgo } },
    include: { items: true },
  });
  const ret = await prisma.uniformWashBatch.findMany({
    where: { status: 'RETURNED_FROM_LAUNDRY', returnedAt: { lt: threeDaysAgo } },
    include: { items: true },
  });

  let count = 0;
  for (const b of sent) {
    const days = Math.floor((now.getTime() - b.sentAt!.getTime()) / (24 * 60 * 60 * 1000));
    await notify({
      type: 'UNIFORM_WASH_BATCH_STAGNANT',
      channels: ['EMAIL', 'IN_APP'],
      audience: 'ADMINS',
      dedupKey: `wash-stagnant-${b.id}-sent-${today()}`,
      title: `Lot de lavage bloqué (envoyé depuis ${days}j)`,
      message: `Lot ${b.id.slice(0, 8)} chez ${b.vendor || 'fournisseur'} — ${b.items.length} pièce(s) non revenues`,
      link: `/uniformes/lavage/${b.id}`,
      payload: { batchId: b.id, days },
    });
    count++;
  }
  for (const b of ret) {
    const days = Math.floor((now.getTime() - b.returnedAt!.getTime()) / (24 * 60 * 60 * 1000));
    await notify({
      type: 'UNIFORM_WASH_BATCH_STAGNANT',
      channels: ['EMAIL', 'IN_APP'],
      audience: 'ADMINS',
      dedupKey: `wash-stagnant-${b.id}-ret-${today()}`,
      title: `Lot revenu non inspecté (${days}j)`,
      message: `Lot ${b.id.slice(0, 8)} revenu mais inspection oubliée — ${b.items.length} pièce(s) en attente`,
      link: `/uniformes/lavage/${b.id}`,
      payload: { batchId: b.id, days },
    });
    count++;
  }
  return count;
}

// =============================================================================
// 4. Stock bas
// =============================================================================
export async function checkLowStock(): Promise<number> {
  const variants = await prisma.uniformVariant.findMany({
    where: { isActive: true, reorderThreshold: { not: null } },
    include: { item: true },
  });
  let count = 0;
  for (const v of variants) {
    if (v.reorderThreshold == null) continue;
    if (v.quantityOnHand >= v.reorderThreshold) continue;
    const isZero = v.quantityOnHand === 0;
    await notify({
      type: isZero ? 'UNIFORM_STOCK_ZERO' : 'UNIFORM_LOW_STOCK',
      channels: isZero ? ['EMAIL', 'IN_APP'] : ['IN_APP'],
      audience: 'ADMINS',
      dedupKey: `${isZero ? 'stock-zero' : 'low-stock'}-${v.id}-${today()}`,
      title: isZero
        ? `Stock à zéro : ${v.item.name} ${v.size}`
        : `Stock bas : ${v.item.name} ${v.size}`,
      message: `Disponible : ${v.quantityOnHand} · Seuil : ${v.reorderThreshold}`,
      link: `/uniformes/inventaire`,
      payload: { variantId: v.id, quantityOnHand: v.quantityOnHand, reorderThreshold: v.reorderThreshold },
    });
    count++;
  }
  return count;
}

// =============================================================================
// 5. Signature lien expirant <24h
// =============================================================================
export async function checkSignaturesExpiring(): Promise<number> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const issuances = await prisma.uniformIssuance.findMany({
    where: {
      signTokenExpiresAt: { not: null, gte: now, lte: in24h },
      signatureStatus: { in: ['PENDING', 'SENT'] },
    },
  });
  const returns = await prisma.uniformReturn.findMany({
    where: {
      signTokenExpiresAt: { not: null, gte: now, lte: in24h },
      signatureStatus: { in: ['PENDING', 'SENT'] },
    },
  });

  let count = 0;
  for (const i of issuances) {
    await notify({
      type: 'UNIFORM_SIGNATURE_EXPIRING',
      channels: ['IN_APP'],
      audience: 'ADMINS',
      dedupKey: `sig-exp-soon-issuance-${i.id}`,
      title: 'Lien de signature expire <24h',
      message: `Remise ${i.id.slice(0, 8)} — agent n'a pas encore signé`,
      link: `/employees/${i.employeeId}`,
      payload: { issuanceId: i.id, employeeId: i.employeeId },
    });
    count++;
  }
  for (const r of returns) {
    await notify({
      type: 'UNIFORM_SIGNATURE_EXPIRING',
      channels: ['IN_APP'],
      audience: 'ADMINS',
      dedupKey: `sig-exp-soon-return-${r.id}`,
      title: 'Lien de signature retour expire <24h',
      message: `Retour ${r.id.slice(0, 8)} — agent n'a pas encore signé`,
      link: `/employees/${r.employeeId}`,
      payload: { returnId: r.id, employeeId: r.employeeId },
    });
    count++;
  }
  return count;
}

// =============================================================================
// 6. Signature lien expiré (sans signature)
// =============================================================================
export async function checkSignaturesExpired(): Promise<number> {
  const now = new Date();
  const issuances = await prisma.uniformIssuance.findMany({
    where: { signTokenExpiresAt: { not: null, lt: now }, signatureStatus: { in: ['PENDING', 'SENT'] } },
  });
  let count = 0;
  for (const i of issuances) {
    await notify({
      type: 'UNIFORM_SIGNATURE_EXPIRED',
      channels: ['IN_APP'],
      audience: 'ADMINS',
      dedupKey: `sig-expired-issuance-${i.id}`,
      title: 'Lien de signature expiré',
      message: `Remise ${i.id.slice(0, 8)} — relancer la signature`,
      link: `/employees/${i.employeeId}`,
      payload: { issuanceId: i.id, employeeId: i.employeeId },
    });
    count++;
  }
  return count;
}

// =============================================================================
// 7. Employeur n'a pas signé sous 24h
// =============================================================================
export async function checkEmployerSignPending(): Promise<number> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const issuances = await prisma.uniformIssuance.findMany({
    where: {
      status: 'ISSUED',
      issuedAt: { lt: dayAgo },
      employerSignatureStoragePath: null,
    },
  });
  let count = 0;
  for (const i of issuances) {
    await notify({
      type: 'UNIFORM_EMPLOYER_SIGN_PENDING',
      channels: ['IN_APP'],
      audience: 'ADMINS',
      dedupKey: `employer-sign-${i.id}`,
      title: 'Signature employeur en retard',
      message: `Remise ${i.id.slice(0, 8)} — employeur n'a pas signé depuis +24h`,
      link: `/employees/${i.employeeId}`,
      payload: { issuanceId: i.id, employeeId: i.employeeId },
    });
    count++;
  }
  return count;
}

// =============================================================================
// 8. Dette aging >30j
// =============================================================================
export async function checkDebtAging(): Promise<number> {
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Tous les retours finalisés > 30 jours avec items non-GOOD non encore réglés
  const oldReturns = await prisma.uniformReturn.findMany({
    where: { status: 'RETURNED', returnedAt: { lt: monthAgo } },
    include: { lines: true },
    distinct: ['employeeId'],
  });

  let count = 0;
  const seenEmployees = new Set<string>();
  for (const r of oldReturns) {
    if (seenEmployees.has(r.employeeId)) continue;
    seenEmployees.add(r.employeeId);
    const hasDebt = r.lines.some((l) => ['DAMAGED', 'LOST', 'NOT_RETURNED'].includes(l.condition));
    if (!hasDebt) continue;
    const owed = await computeAmountOwed(r.employeeId);
    if (owed.owed <= 0) continue;
    const emp = await prisma.employee.findUnique({ where: { id: r.employeeId } });
    const name = emp ? `${emp.firstName} ${emp.lastName}` : r.employeeId.slice(0, 8);
    await notify({
      type: 'UNIFORM_DEBT_AGING',
      channels: ['EMAIL', 'IN_APP'],
      audience: 'RH',
      dedupKey: `debt-aging-${r.employeeId}-${today()}`,
      title: `Dette uniforme >30j non réglée — ${name}`,
      message: `Montant dû : ${owed.owed.toFixed(2)} $`,
      link: `/employees/${r.employeeId}`,
      payload: { employeeId: r.employeeId, owed: owed.owed },
    });
    count++;
  }
  return count;
}

// =============================================================================
// 9. Variant désactivée avec stock > 0
// =============================================================================
export async function checkInactiveVariantsWithStock(): Promise<number> {
  const variants = await prisma.uniformVariant.findMany({
    where: { isActive: false, quantityOnHand: { gt: 0 } },
    include: { item: true },
  });
  let count = 0;
  for (const v of variants) {
    await notify({
      type: 'UNIFORM_INACTIVE_VARIANT_HAS_STOCK',
      channels: ['IN_APP'],
      audience: 'ADMINS',
      dedupKey: `inactive-stock-${v.id}`,
      title: 'Variante désactivée avec stock résiduel',
      message: `${v.item.name} ${v.size} — ${v.quantityOnHand} pièce(s) à réaffecter ou ajuster`,
      link: `/uniformes/inventaire`,
      payload: { variantId: v.id, quantityOnHand: v.quantityOnHand },
    });
    count++;
  }
  return count;
}

// =============================================================================
// 10. Doublons de remises actives pour un même agent
// =============================================================================
export async function checkDuplicateActiveIssuances(): Promise<number> {
  const grouped = await prisma.uniformIssuance.groupBy({
    by: ['employeeId'],
    where: { status: { in: ['ISSUED', 'PARTIALLY_RETURNED'] } },
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
  });
  let count = 0;
  for (const g of grouped) {
    const emp = await prisma.employee.findUnique({ where: { id: g.employeeId } });
    const name = emp ? `${emp.firstName} ${emp.lastName}` : g.employeeId.slice(0, 8);
    await notify({
      type: 'UNIFORM_DUPLICATE_ACTIVE_ISSUANCE',
      channels: ['IN_APP'],
      audience: 'ADMINS',
      dedupKey: `dup-active-${g.employeeId}-${today()}`,
      title: `Plusieurs remises actives — ${name}`,
      message: `${g._count.id} remises actives — consolidation recommandée`,
      link: `/employees/${g.employeeId}`,
      payload: { employeeId: g.employeeId, count: g._count.id },
    });
    count++;
  }
  return count;
}

// =============================================================================
// Orchestrateur
// =============================================================================
export interface SurveillanceResult {
  dueSoon: number;
  overdue: number;
  washStagnant: number;
  lowStock: number;
  sigExpiring: number;
  sigExpired: number;
  employerSignPending: number;
  debtAging: number;
  inactiveStock: number;
  duplicateActive: number;
}

export async function surveillanceJob(): Promise<SurveillanceResult> {
  const [
    dueSoon,
    overdue,
    washStagnant,
    lowStock,
    sigExpiring,
    sigExpired,
    employerSignPending,
    debtAging,
    inactiveStock,
    duplicateActive,
  ] = await Promise.all([
    checkReturnsDueSoon().catch((e) => { console.error('checkReturnsDueSoon:', e); return 0; }),
    checkReturnsOverdue().catch((e) => { console.error('checkReturnsOverdue:', e); return 0; }),
    checkWashBatchesStagnant().catch((e) => { console.error('checkWashBatchesStagnant:', e); return 0; }),
    checkLowStock().catch((e) => { console.error('checkLowStock:', e); return 0; }),
    checkSignaturesExpiring().catch((e) => { console.error('checkSignaturesExpiring:', e); return 0; }),
    checkSignaturesExpired().catch((e) => { console.error('checkSignaturesExpired:', e); return 0; }),
    checkEmployerSignPending().catch((e) => { console.error('checkEmployerSignPending:', e); return 0; }),
    checkDebtAging().catch((e) => { console.error('checkDebtAging:', e); return 0; }),
    checkInactiveVariantsWithStock().catch((e) => { console.error('checkInactiveVariantsWithStock:', e); return 0; }),
    checkDuplicateActiveIssuances().catch((e) => { console.error('checkDuplicateActiveIssuances:', e); return 0; }),
  ]);

  return { dueSoon, overdue, washStagnant, lowStock, sigExpiring, sigExpired, employerSignPending, debtAging, inactiveStock, duplicateActive };
}
