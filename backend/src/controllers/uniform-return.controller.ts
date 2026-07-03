import { Request, Response, NextFunction } from 'express';
import { UniformItemCondition } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';
import { applyMovement, computeAmountOwed, computeHoldings } from '../services/uniform-stock.service';
import { generateReturnPdf } from '../services/uniform-pdf.service';
import { uploadBufferToR2, getSignedFileUrl } from '../services/r2.service';
import { uploadSignaturePng } from '../utils/signature';
import { sendSignatureSms } from '../services/sms.service';
import { generateShareToken, getTokenExpiration } from '../utils/token';
import { SIGN_TOKEN_DAYS } from '../constants/uniform';
import { notify } from '../services/notification.service';
import { getOrCreateOpenBatch } from '../services/uniform-wash-batch.service';

const userId = (req: Request): string | undefined => (req.user as any)?.id;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

interface ReturnLineInput {
  variantId?: string;
  customItemName?: string;
  quantity: number;
  condition: UniformItemCondition;
  unitReplacementCost?: number;
}

export const getHoldings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const holdings = await computeHoldings(req.params.employeeId);
    res.json({ data: holdings });
  } catch (error) {
    next(error);
  }
};

async function buildReturnLines(lines: ReturnLineInput[]) {
  const variantIds = lines.filter((l) => l.variantId).map((l) => l.variantId!) as string[];
  const variants = await prisma.uniformVariant.findMany({ where: { id: { in: variantIds } } });
  const vMap = new Map(variants.map((v) => [v.id, v]));
  return lines
    .filter((l) => l.quantity > 0)
    .map((l) => ({
      variantId: l.variantId ?? null,
      customItemName: l.variantId ? null : l.customItemName || 'Autre',
      quantity: l.quantity,
      condition: l.condition,
      unitReplacementCost:
        l.unitReplacementCost ??
        (l.variantId && vMap.get(l.variantId) ? Number(vMap.get(l.variantId)!.replacementCost) : 0),
    }));
}

export const createReturn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { issuanceId, lines, notes } = req.body;
    if (!issuanceId) throw new ApiError(400, 'issuanceId requis');
    const issuance = await prisma.uniformIssuance.findUnique({ where: { id: issuanceId } });
    if (!issuance) throw new ApiError(404, 'Remise introuvable');

    // Retour tardif : remise clôturée à la fin d'emploi. La dette est DÉJÀ figée
    // par les lignes NOT_RETURNED de la clôture — les lignes de ce retour portent
    // donc un coût 0 (sinon computeAmountOwed facturerait une 2ᵉ fois). Les
    // pièces revenues en bon état créditeront la dette à la finalisation.
    const isLateReturn = issuance.status === 'CLOSED_TERMINATION';

    const lineData = await buildReturnLines(lines || []);
    if (lineData.length === 0) throw new ApiError(400, 'Ajoutez au moins une pièce à retourner');
    if (isLateReturn) lineData.forEach((l) => { l.unitReplacementCost = 0; });

    const ret = await prisma.uniformReturn.create({
      data: {
        issuanceId,
        employeeId: issuance.employeeId,
        isLateReturn,
        notes: notes ?? null,
        createdById: userId(req),
        lines: { create: lineData },
      },
      include: { lines: { include: { variant: { include: { item: true } } } } },
    });
    res.status(201).json({ message: isLateReturn ? 'Retour tardif créé (brouillon)' : 'Retour créé (brouillon)', data: ret });
  } catch (error) {
    next(error);
  }
};

export const getReturn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ret = await prisma.uniformReturn.findUnique({
      where: { id: req.params.id },
      include: { lines: { include: { variant: { include: { item: true } } } } },
    });
    if (!ret) throw new ApiError(404, 'Retour introuvable');
    const employee = await prisma.employee.findUnique({ where: { id: ret.employeeId } });
    res.json({ data: { ...ret, employee } });
  } catch (error) {
    next(error);
  }
};

/**
 * Crédite la dette d'un employé après un RETOUR TARDIF (remise CLOSED_TERMINATION) :
 * chaque pièce revenue en BON état est valorisée au coût facturé à la clôture
 * (lignes NOT_RETURNED de la remise) et un règlement automatique est créé,
 * plafonné au solde dû (jamais de crédit excédentaire). DAMAGED ne crédite rien :
 * la pièce doit être remplacée de toute façon.
 *
 * @returns le montant crédité (0 si rien à créditer).
 */
async function settleLateReturn(
  ret: { id: string; issuanceId: string; employeeId: string; lines: { variantId: string | null; quantity: number; condition: UniformItemCondition }[] },
  createdById?: string,
): Promise<number> {
  const goodByVariant = new Map<string, number>();
  for (const l of ret.lines) {
    if (l.condition === 'GOOD' && l.variantId) {
      goodByVariant.set(l.variantId, (goodByVariant.get(l.variantId) || 0) + l.quantity);
    }
  }
  if (goodByVariant.size === 0) return 0;

  // Coût facturé à la clôture, par variante.
  const closureLines = await prisma.uniformReturnLine.findMany({
    where: { return: { issuanceId: ret.issuanceId, status: 'RETURNED' }, condition: 'NOT_RETURNED' },
  });
  const costByVariant = new Map<string, number>();
  for (const cl of closureLines) {
    if (cl.variantId && !costByVariant.has(cl.variantId)) {
      costByVariant.set(cl.variantId, Number(cl.unitReplacementCost));
    }
  }

  let credit = 0;
  for (const [variantId, qty] of goodByVariant) credit += qty * (costByVariant.get(variantId) ?? 0);
  if (credit <= 0) return 0;

  const { owed } = await computeAmountOwed(ret.employeeId);
  const amount = Math.min(credit, owed);
  if (amount <= 0) return 0;

  await prisma.uniformDebtSettlement.create({
    data: {
      employeeId: ret.employeeId,
      amount,
      method: 'RETOUR TARDIF',
      notes: `Retour tardif ${ret.id} — remise ${ret.issuanceId} : crédit des pièces rapportées en bon état`,
      createdById: createdById ?? null,
    },
  });

  const after = await computeAmountOwed(ret.employeeId);
  notify({
    type: 'UNIFORM_SETTLEMENT_RECORDED',
    channels: ['IN_APP'],
    audience: 'RH',
    title: 'Retour tardif — dette créditée',
    message: `${amount.toFixed(2)} $ crédités (pièces rapportées en bon état) — solde restant : ${after.owed.toFixed(2)} $`,
    link: `/employees/${ret.employeeId}`,
    payload: { returnId: ret.id, employeeId: ret.employeeId, amount, owedAfter: after.owed },
  }).catch((e) => console.error('notify failed:', e));

  return amount;
}

/** Recalcule le statut de la remise parente après un retour. */
async function refreshParentStatus(issuanceId: string) {
  const issuance = await prisma.uniformIssuance.findUnique({
    where: { id: issuanceId },
    include: { lines: true, returns: { where: { status: 'RETURNED' }, include: { lines: true } } },
  });
  if (!issuance || issuance.status === 'CANCELLED' || issuance.status === 'CLOSED_TERMINATION') return;

  const remaining = new Map<string, number>();
  for (const l of issuance.lines) {
    if (!l.variantId) continue;
    remaining.set(l.variantId, (remaining.get(l.variantId) || 0) + l.quantity);
  }
  for (const ret of issuance.returns) {
    for (const rl of ret.lines) {
      if (!rl.variantId) continue;
      remaining.set(rl.variantId, (remaining.get(rl.variantId) || 0) - rl.quantity);
    }
  }
  const anyLeft = [...remaining.values()].some((q) => q > 0);
  await prisma.uniformIssuance.update({
    where: { id: issuanceId },
    data: { status: anyLeft ? 'PARTIALLY_RETURNED' : 'RETURNED' },
  });
}

/**
 * V2 — Finalise un retour avec triage par pièce :
 *   - GOOD     → ajout à un wash batch (créé inline) + mouvement WASH_IN
 *     (la pièce sort de quantityOnHand et entre dans un cycle de lavage —
 *      ne revient au stock qu'après l'inspection post-lavage).
 *   - DAMAGED  → mouvement DAMAGED (sortie définitive, poubelle directe) +
 *     dette via unitReplacementCost.
 *   - LOST/NOT_RETURNED → pas de mouvement (déjà sortie via OUT à la remise) +
 *     dette via unitReplacementCost.
 *
 * Émet ensuite deux notifs hors transaction :
 *   - UNIFORM_WASH_BATCH_CREATED si au moins une pièce GOOD
 *   - UNIFORM_RETURN_DAMAGED si au moins une pièce DAMAGED/LOST/NOT_RETURNED
 */
export const finalizeReturn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ret = await prisma.uniformReturn.findUnique({
      where: { id: req.params.id },
      include: { lines: true },
    });
    if (!ret) throw new ApiError(404, 'Retour introuvable');
    if (ret.status !== 'DRAFT') throw new ApiError(400, 'Retour déjà finalisé');

    const signToken = generateShareToken();
    const signTokenExpiresAt = getTokenExpiration(SIGN_TOKEN_DAYS);

    let washBatchId: string | null = null;
    let washBatchIsNew = false;
    let goodCount = 0;
    let damagedCount = 0;
    let lostCount = 0;

    // Récupère le lot ouvert AVANT la transaction (peut créer un nouveau si aucun
    // n'existe). Tous les items "Bon" de ce retour s'y ajoutent.
    const hasGood = ret.lines.some((l) => l.condition === 'GOOD' && l.variantId);
    if (hasGood) {
      const beforeCount = await prisma.uniformWashBatch.count({ where: { status: 'CREATED' } });
      const openBatch = await getOrCreateOpenBatch({ createdById: userId(req) });
      washBatchId = openBatch.id;
      washBatchIsNew = beforeCount === 0;
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const line of ret.lines) {
        if (line.condition === 'GOOD' && line.variantId && washBatchId) {
          // 1 UniformWashBatchItem par UNITÉ (qty=1) pour granularité d'inspection
          const items: { batchId: string; variantId: string; quantity: number; returnLineId: string }[] = [];
          for (let i = 0; i < line.quantity; i++) {
            items.push({ batchId: washBatchId, variantId: line.variantId, quantity: 1, returnLineId: line.id });
          }
          await tx.uniformWashBatchItem.createMany({ data: items });
          // F2 (audit) — la pièce rapportée par l'agent RÉ-ENTRE physiquement en
          // stock (IN +1) AVANT d'aller au lavage. Sans ce crédit, le cycle
          // remise(-1) → retour → lavage(WASH_OUT_GOOD +1) perdait 1 pièce à
          // chaque fois, et bloquait le retour quand la réserve tombait à 0.
          await applyMovement(tx, {
            variantId: line.variantId,
            type: 'IN',
            quantity: line.quantity,
            location: 'BACK_OFFICE',
            reason: `Retour ${ret.id} (réintégration physique)`,
            returnId: ret.id,
            createdById: userId(req),
          });
          // Mouvement WASH_IN (delta - sur quantityOnHand). Débit pris sur le
          // BACK_OFFICE (la réserve qui porte le stock) : sûr même quand le
          // front office est à 0. Les pièces propres ré-entreront au FRONT_OFFICE
          // à l'inspection (WASH_OUT_GOOD), ce qui les "ramène au comptoir".
          await applyMovement(tx, {
            variantId: line.variantId,
            type: 'WASH_IN',
            quantity: line.quantity,
            location: 'BACK_OFFICE',
            reason: `Retour ${ret.id} → lot ${washBatchId}`,
            returnId: ret.id,
            createdById: userId(req),
          });
          goodCount += line.quantity;
        } else if (line.condition === 'DAMAGED' && line.variantId) {
          // F2 (audit) — la pièce rapportée RÉ-ENTRE en stock (IN +1) puis part au
          // rebut (DAMAGED -1) : net -1 (UNE pièce détruite), au lieu de -2 avant.
          await applyMovement(tx, {
            variantId: line.variantId,
            type: 'IN',
            quantity: line.quantity,
            location: 'BACK_OFFICE',
            reason: `Retour ${ret.id} (réintégration avant rebut)`,
            returnId: ret.id,
            createdById: userId(req),
          });
          await applyMovement(tx, {
            variantId: line.variantId,
            type: 'DAMAGED',
            quantity: line.quantity,
            location: 'BACK_OFFICE', // débit de perte sur la réserve (sûr)
            reason: `Retour ${ret.id} (poubelle directe)`,
            returnId: ret.id,
            createdById: userId(req),
          });
          damagedCount += line.quantity;
        } else if (line.condition === 'LOST' || line.condition === 'NOT_RETURNED') {
          // Pas de mouvement (déjà sortie à la remise). Dette via unitReplacementCost.
          lostCount += line.quantity;
        }
      }
      return tx.uniformReturn.update({
        where: { id: ret.id },
        data: { status: 'RETURNED', returnedAt: new Date(), signToken, signTokenExpiresAt },
        include: { lines: { include: { variant: { include: { item: true } } } } },
      });
    });

    await refreshParentStatus(ret.issuanceId);

    // Retour tardif : crédite la dette figée pour les pièces revenues en bon état.
    let settledAmount = 0;
    if (ret.isLateReturn) {
      settledAmount = await settleLateReturn(ret, userId(req));
    }

    try {
      const pdf = await generateReturnPdf(ret.id);
      const { key } = await uploadBufferToR2(pdf, `forms/returns/${ret.id}.pdf`, 'application/pdf');
      await prisma.uniformReturn.update({ where: { id: ret.id }, data: { formPdfStoragePath: key } });
    } catch (e) {
      console.error('PDF retour échoué:', (e as Error).message);
    }

    // Notifs hors-transaction
    if (washBatchId) {
      notify({
        type: 'UNIFORM_WASH_BATCH_CREATED',
        channels: ['IN_APP'],
        audience: 'ADMINS',
        title: washBatchIsNew ? `Nouveau lot de lavage ouvert` : `Pièces ajoutées au lot ouvert`,
        message: washBatchIsNew
          ? `${goodCount} pièce(s) à laver — lot accumule les retours futurs`
          : `${goodCount} pièce(s) ajoutée(s) au lot ouvert existant`,
        link: `/uniformes/lavage/${washBatchId}`,
        payload: { batchId: washBatchId, returnId: ret.id, goodCount, washBatchIsNew },
      }).catch((e) => console.error('notify failed:', e));
    }
    // Retour tardif : pas de notif « dette à confirmer » — la dette est déjà
    // figée depuis la clôture ; le crédit éventuel a sa propre notif (règlement).
    if ((damagedCount > 0 || lostCount > 0) && !ret.isLateReturn) {
      notify({
        type: 'UNIFORM_RETURN_DAMAGED',
        channels: ['IN_APP', 'EMAIL'],
        audience: 'ADMINS',
        title: `Retour avec pièces non récupérables`,
        message: `${damagedCount} pièce(s) endommagée(s), ${lostCount} perdue(s) — dette à confirmer`,
        link: `/employees/${ret.employeeId}`,
        payload: { returnId: ret.id, employeeId: ret.employeeId, damagedCount, lostCount },
      }).catch((e) => console.error('notify failed:', e));
    }

    res.json({
      message: ret.isLateReturn ? 'Retour tardif finalisé' : 'Retour finalisé',
      data: { ...updated, washBatchId, goodCount, damagedCount, lostCount, settledAmount },
    });
  } catch (error) {
    next(error);
  }
};

export const sendReturnSms = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ret = await prisma.uniformReturn.findUnique({ where: { id: req.params.id } });
    if (!ret) throw new ApiError(404, 'Retour introuvable');
    if (ret.status === 'DRAFT') throw new ApiError(400, 'Finalisez le retour avant l’envoi');

    let token = ret.signToken;
    if (!token) {
      token = generateShareToken();
      await prisma.uniformReturn.update({
        where: { id: ret.id },
        data: { signToken: token, signTokenExpiresAt: getTokenExpiration(SIGN_TOKEN_DAYS) },
      });
    }
    const employee = await prisma.employee.findUnique({ where: { id: ret.employeeId } });
    const result = await sendSignatureSms({
      phone: employee?.phone,
      email: employee?.email,
      firstName: employee?.firstName,
      url: `${FRONTEND_URL}/uniformes/signer/${token}`,
      kind: 'retour',
    });
    const updated = await prisma.uniformReturn.update({
      where: { id: ret.id },
      data: { signatureStatus: 'SENT', smsSentAt: new Date(), ghlMessageId: result.messageId ?? null },
    });
    res.json({ message: 'SMS envoyé', data: updated });
  } catch (error) {
    next(error);
  }
};

export const counterSignReturn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { employeeSignatureBase64, employerSignatureBase64, signedByName } = req.body;
    const ret = await prisma.uniformReturn.findUnique({ where: { id: req.params.id } });
    if (!ret) throw new ApiError(404, 'Retour introuvable');
    if (ret.status === 'DRAFT') throw new ApiError(400, 'Finalisez le retour avant la signature');

    const data: any = {};
    if (employeeSignatureBase64) {
      data.employeeSignatureStoragePath = await uploadSignaturePng(
        employeeSignatureBase64,
        `signatures/returns/${ret.id}-employee.png`
      );
      data.signatureStatus = 'SIGNED';
      data.signatureMethod = 'COUNTER';
      data.signedAt = new Date();
      data.signedByName = signedByName ?? null;
      data.signToken = null;
      data.signTokenExpiresAt = null;
    }
    if (employerSignatureBase64) {
      data.employerSignatureStoragePath = await uploadSignaturePng(
        employerSignatureBase64,
        `signatures/returns/${ret.id}-employer.png`
      );
    }
    if (Object.keys(data).length === 0) throw new ApiError(400, 'Aucune signature fournie');

    const updated = await prisma.uniformReturn.update({ where: { id: ret.id }, data });

    try {
      const pdf = await generateReturnPdf(ret.id);
      const { key } = await uploadBufferToR2(pdf, `forms/returns/${ret.id}.pdf`, 'application/pdf');
      await prisma.uniformReturn.update({ where: { id: ret.id }, data: { formPdfStoragePath: key } });
    } catch (e) {
      console.error('PDF retour échoué:', (e as Error).message);
    }

    res.json({ message: 'Signature enregistrée', data: updated });
  } catch (error) {
    next(error);
  }
};

export const getReturnPdfUrl = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ret = await prisma.uniformReturn.findUnique({ where: { id: req.params.id } });
    if (!ret) throw new ApiError(404, 'Retour introuvable');
    let key = ret.formPdfStoragePath;
    if (!key) {
      const pdf = await generateReturnPdf(ret.id);
      const uploaded = await uploadBufferToR2(pdf, `forms/returns/${ret.id}.pdf`, 'application/pdf');
      key = uploaded.key;
      await prisma.uniformReturn.update({ where: { id: ret.id }, data: { formPdfStoragePath: key } });
    }
    const url = await getSignedFileUrl(key, 3600);
    res.json({ data: { url } });
  } catch (error) {
    next(error);
  }
};
