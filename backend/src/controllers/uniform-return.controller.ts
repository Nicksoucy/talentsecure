import { Request, Response, NextFunction } from 'express';
import { UniformItemCondition } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';
import { applyMovement, computeHoldings } from '../services/uniform-stock.service';
import { generateReturnPdf } from '../services/uniform-pdf.service';
import { uploadBufferToR2, getSignedFileUrl } from '../services/r2.service';
import { uploadSignaturePng } from '../utils/signature';
import { sendSignatureSms } from '../services/sms.service';
import { generateShareToken, getTokenExpiration } from '../utils/token';
import { SIGN_TOKEN_DAYS } from '../constants/uniform';

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

    const lineData = await buildReturnLines(lines || []);
    if (lineData.length === 0) throw new ApiError(400, 'Ajoutez au moins une pièce à retourner');

    const ret = await prisma.uniformReturn.create({
      data: {
        issuanceId,
        employeeId: issuance.employeeId,
        notes: notes ?? null,
        createdById: userId(req),
        lines: { create: lineData },
      },
      include: { lines: { include: { variant: { include: { item: true } } } } },
    });
    res.status(201).json({ message: 'Retour créé (brouillon)', data: ret });
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
 * Finalise un retour : les pièces en BON état réintègrent le stock (mouvement
 * IN) ; PERDU/ENDOMMAGÉ/NON-RETOURNÉ ne réintègrent pas (elles génèrent un
 * montant dû via les lignes). Génère le lien de signature + PDF.
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

    const updated = await prisma.$transaction(async (tx) => {
      for (const line of ret.lines) {
        if (line.condition === 'GOOD' && line.variantId) {
          await applyMovement(tx, {
            variantId: line.variantId,
            type: 'IN',
            quantity: line.quantity,
            reason: `Retour ${ret.id}`,
            returnId: ret.id,
            createdById: userId(req),
          });
        }
        // DAMAGED / LOST / NOT_RETURNED : pas de réintégration de stock.
      }
      return tx.uniformReturn.update({
        where: { id: ret.id },
        data: { status: 'RETURNED', returnedAt: new Date(), signToken, signTokenExpiresAt },
        include: { lines: { include: { variant: { include: { item: true } } } } },
      });
    });

    await refreshParentStatus(ret.issuanceId);

    try {
      const pdf = await generateReturnPdf(ret.id);
      const { key } = await uploadBufferToR2(pdf, `forms/returns/${ret.id}.pdf`, 'application/pdf');
      await prisma.uniformReturn.update({ where: { id: ret.id }, data: { formPdfStoragePath: key } });
    } catch (e) {
      console.error('PDF retour échoué:', (e as Error).message);
    }

    res.json({ message: 'Retour finalisé', data: updated });
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
