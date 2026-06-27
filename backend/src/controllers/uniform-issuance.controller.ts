import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';
import { applyMovement } from '../services/uniform-stock.service';
import { generateIssuancePdf } from '../services/uniform-pdf.service';
import { uploadBufferToR2, getSignedFileUrl } from '../services/r2.service';
import { uploadSignaturePng } from '../utils/signature';
import { sendSignatureSms } from '../services/sms.service';
import { generateShareToken, getTokenExpiration } from '../utils/token';
import { SIGN_TOKEN_DAYS } from '../constants/uniform';
import { notify } from '../services/notification.service';
import { subtractBusinessHours } from '../utils/business-days';
import { closeTerminationCore, notifyTerminationClosed } from '../services/uniform-termination.service';

const userId = (req: Request): string | undefined => (req.user as any)?.id;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

type SourceLoc = 'BACK_OFFICE' | 'FRONT_OFFICE';
interface LineInput {
  variantId?: string;
  customItemName?: string;
  quantity: number;
  unitCost?: number;
  /** Emplacement d'où CETTE pièce sort (du QR scanné). null = défaut de la remise. */
  sourceLocation?: SourceLoc;
}

interface BuiltLine {
  variantId: string | null;
  customItemName: string | null;
  quantity: number;
  unitCostSnapshot: number;
  sourceLocation: SourceLoc | null;
}

/**
 * Normalise + fusionne les lignes. Fusion par (variante + emplacement source) :
 * une même variante sortie du front ET du back donne DEUX lignes distinctes.
 */
async function buildLines(lines: LineInput[]): Promise<BuiltLine[]> {
  const merged = new Map<string, LineInput>();
  const customs: LineInput[] = [];
  for (const l of lines) {
    if (!l.quantity || l.quantity <= 0) continue;
    if (l.variantId) {
      const key = `${l.variantId}::${l.sourceLocation ?? ''}`;
      const cur = merged.get(key);
      if (cur) cur.quantity += l.quantity;
      else merged.set(key, { ...l });
    } else {
      customs.push(l);
    }
  }
  const variantIds = [...new Set([...merged.values()].map((l) => l.variantId!))];
  const variants = await prisma.uniformVariant.findMany({ where: { id: { in: variantIds } } });
  const vMap = new Map(variants.map((v) => [v.id, v]));

  const data: BuiltLine[] = [];
  for (const l of merged.values()) {
    const v = vMap.get(l.variantId!);
    if (!v) throw new ApiError(404, `Variante ${l.variantId} introuvable`);
    data.push({
      variantId: l.variantId!,
      customItemName: null,
      quantity: l.quantity,
      unitCostSnapshot: l.unitCost ?? Number(v.replacementCost),
      sourceLocation: l.sourceLocation ?? null,
    });
  }
  for (const c of customs) {
    data.push({
      variantId: null,
      customItemName: c.customItemName || 'Autre',
      quantity: c.quantity,
      unitCostSnapshot: c.unitCost ?? 0,
      sourceLocation: null,
    });
  }
  return data;
}

export const listIssuances = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { employeeId, status, division, page = 1, limit = 20 } = req.query;
    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;
    if (division) where.division = division;
    const skip = (Number(page) - 1) * Number(limit);

    const [total, issuances] = await prisma.$transaction([
      prisma.uniformIssuance.count({ where }),
      prisma.uniformIssuance.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { lines: { include: { variant: { include: { item: true } } } } },
      }),
    ]);

    const employeeIds = [...new Set(issuances.map((i) => i.employeeId))];
    const employees = await prisma.employee.findMany({ where: { id: { in: employeeIds } } });
    const empMap = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
    const data = issuances.map((i) => ({
      ...i,
      employeeName: empMap.get(i.employeeId) || i.employeeId,
      itemsCount: i.lines.reduce((s, l) => s + l.quantity, 0),
    }));

    res.json({
      data,
      pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    next(error);
  }
};

export const getIssuance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const issuance = await prisma.uniformIssuance.findUnique({
      where: { id: req.params.id },
      include: { lines: { include: { variant: { include: { item: true } } } }, returns: { include: { lines: true } } },
    });
    if (!issuance) throw new ApiError(404, 'Remise introuvable');
    const employee = await prisma.employee.findUnique({ where: { id: issuance.employeeId } });
    res.json({ data: { ...issuance, employee } });
  } catch (error) {
    next(error);
  }
};

export const createIssuance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { employeeId, division, dueReturnAt, notes, lines, sourceLocation } = req.body;
    if (!employeeId) throw new ApiError(400, 'employeeId requis');
    if (!division) throw new ApiError(400, 'division requise');
    if (sourceLocation && sourceLocation !== 'BACK_OFFICE' && sourceLocation !== 'FRONT_OFFICE') {
      throw new ApiError(400, 'sourceLocation invalide');
    }

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.isDeleted) throw new ApiError(404, 'Agent introuvable');

    const lineData = await buildLines(lines || []);
    const issuance = await prisma.uniformIssuance.create({
      data: {
        employeeId,
        division,
        dueReturnAt: dueReturnAt ? new Date(dueReturnAt) : null,
        notes: notes ?? null,
        // Défaut DB = FRONT_OFFICE si non fourni (comptoir de remise).
        ...(sourceLocation ? { sourceLocation } : {}),
        createdById: userId(req),
        lines: { create: lineData },
      },
      include: { lines: { include: { variant: { include: { item: true } } } } },
    });
    res.status(201).json({ message: 'Remise créée (brouillon)', data: issuance });
  } catch (error) {
    next(error);
  }
};

export const updateIssuance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.uniformIssuance.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new ApiError(404, 'Remise introuvable');

    // DRAFT toujours modifiable. ISSUED historique (aucun mouvement de stock) : modifiable
    // aussi — c'est le cas typique d'une remise papier dont on remplit les pièces a posteriori.
    if (existing.status !== 'DRAFT') {
      const movementCount = await prisma.uniformStockMovement.count({
        where: { issuanceId: existing.id, type: 'OUT' },
      });
      const isHistorical = existing.signatureMethod === 'COUNTER' && movementCount === 0;
      if (!isHistorical) {
        throw new ApiError(400, 'Seules les remises en brouillon (ou historiques sans impact stock) sont modifiables');
      }
    }

    const { dueReturnAt, notes, lines } = req.body;
    const lineData = lines ? await buildLines(lines) : null;

    const issuance = await prisma.$transaction(async (tx) => {
      if (lineData) {
        await tx.uniformIssuanceLine.deleteMany({ where: { issuanceId: existing.id } });
        await tx.uniformIssuanceLine.createMany({
          data: lineData.map((l) => ({ ...l, issuanceId: existing.id })),
        });
        // Recalcule le coût total (snapshot)
        const total = lineData.reduce((s, l) => s + l.quantity * l.unitCostSnapshot, 0);
        await tx.uniformIssuance.update({ where: { id: existing.id }, data: { totalLoanCost: total } });
      }
      return tx.uniformIssuance.update({
        where: { id: existing.id },
        data: {
          dueReturnAt: dueReturnAt !== undefined ? (dueReturnAt ? new Date(dueReturnAt) : null) : undefined,
          notes: notes !== undefined ? notes : undefined,
        },
        include: { lines: { include: { variant: { include: { item: true } } } } },
      });
    });
    res.json({ message: 'Remise mise à jour', data: issuance });
  } catch (error) {
    next(error);
  }
};

/**
 * Finalise la remise = REMISE PHYSIQUE : décrémente le stock (OUT) pour chaque
 * ligne avec variante, calcule le coût total, génère le lien de signature et le
 * PDF. Rejette si le stock est insuffisant.
 */
export const finalizeIssuance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.uniformIssuance.findUnique({
      where: { id: req.params.id },
      include: { lines: true },
    });
    if (!existing) throw new ApiError(404, 'Remise introuvable');
    if (existing.status !== 'DRAFT') throw new ApiError(400, 'Remise déjà finalisée');
    if (existing.lines.length === 0) throw new ApiError(400, 'Ajoutez au moins une pièce');

    const { historical, historicalDate } = req.body || {};
    const isHistorical = !!historical;
    const totalLoanCost = existing.lines.reduce((s, l) => s + l.quantity * Number(l.unitCostSnapshot), 0);
    const issuedAt = isHistorical && historicalDate ? new Date(historicalDate) : new Date();
    const signToken = isHistorical ? null : generateShareToken();
    const signTokenExpiresAt = isHistorical ? null : getTokenExpiration(SIGN_TOKEN_DAYS);

    const updated = await prisma.$transaction(async (tx) => {
      // Mode historique : pas de mouvement de stock (la remise a déjà eu lieu).
      if (!isHistorical) {
        for (const line of existing.lines) {
          if (!line.variantId) continue;
          await applyMovement(tx, {
            variantId: line.variantId,
            type: 'OUT',
            quantity: line.quantity,
            // Emplacement par ligne (du QR scanné) ; sinon défaut de la remise.
            location: line.sourceLocation ?? existing.sourceLocation,
            reason: `Remise ${existing.id}`,
            issuanceId: existing.id,
            createdById: userId(req),
          });
        }
      }
      return tx.uniformIssuance.update({
        where: { id: existing.id },
        data: {
          status: 'ISSUED',
          issuedAt,
          totalLoanCost,
          signToken,
          signTokenExpiresAt,
          // En mode historique, on considère que le PDF original (à téléverser) sert de preuve.
          ...(isHistorical ? {
            signatureStatus: 'SIGNED' as const,
            signatureMethod: 'COUNTER' as const,
            signedAt: issuedAt,
            payrollConsentAccepted: true,
            uniformPolicyConsentAccepted: existing.division === 'SECURITE',
            fitAttested: true,
          } : {}),
        },
        include: { lines: { include: { variant: { include: { item: true } } } } },
      });
    });

    // PDF d'archive — en mode historique, on laisse le user uploader le PDF original.
    if (!isHistorical) {
      try {
        const pdf = await generateIssuancePdf(existing.id);
        const { key } = await uploadBufferToR2(pdf, `forms/issuances/${existing.id}.pdf`, 'application/pdf');
        await prisma.uniformIssuance.update({ where: { id: existing.id }, data: { formPdfStoragePath: key } });
      } catch (e) {
        console.error('PDF remise échoué:', (e as Error).message);
      }
    }

    // V2 — Planification du rappel DUE_SOON si date butoir définie.
    if (!isHistorical && existing.dueReturnAt) {
      const employee = await prisma.employee.findUnique({ where: { id: existing.employeeId } });
      const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : 'Agent';
      const scheduledFor = subtractBusinessHours(existing.dueReturnAt, 24);
      notify({
        type: 'UNIFORM_RETURN_DUE_SOON',
        channels: ['EMAIL', 'IN_APP'],
        audience: 'RH',
        scheduledFor,
        dedupKey: `due-soon-${existing.id}`,
        title: `Rappel : retour d'uniforme de ${employeeName} dans 24h ouvrables`,
        message: `Date butoir : ${existing.dueReturnAt.toISOString().split('T')[0]} · Montant à risque : ${totalLoanCost.toFixed(2)} $`,
        link: `/employees/${existing.employeeId}`,
        payload: {
          issuanceId: existing.id,
          employeeId: existing.employeeId,
          dueReturnAt: existing.dueReturnAt.toISOString(),
          totalLoanCost,
        },
      }).catch((e) => console.error('notify failed:', e));
    }

    res.json({
      message: isHistorical
        ? 'Remise historique enregistrée — stock NON modifié'
        : 'Remise finalisée — stock décrémenté',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Téléverse un PDF externe et l'attache à la remise (formPdfStoragePath).
 * Utile pour les remises historiques où on veut joindre le formulaire papier signé.
 */
export const uploadIssuancePdf = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const file = (req as any).file;
    if (!file) throw new ApiError(400, 'Fichier PDF requis (champ "pdf")');
    if (file.mimetype && !file.mimetype.includes('pdf')) {
      throw new ApiError(400, 'Le fichier doit être un PDF');
    }
    const issuance = await prisma.uniformIssuance.findUnique({ where: { id } });
    if (!issuance) throw new ApiError(404, 'Remise introuvable');
    const { key } = await uploadBufferToR2(file.buffer, `forms/issuances/${id}.pdf`, 'application/pdf');
    await prisma.uniformIssuance.update({ where: { id }, data: { formPdfStoragePath: key } });
    res.json({ message: 'PDF téléversé', data: { formPdfStoragePath: key } });
  } catch (error) {
    next(error);
  }
};

export const sendIssuanceSms = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const issuance = await prisma.uniformIssuance.findUnique({ where: { id: req.params.id } });
    if (!issuance) throw new ApiError(404, 'Remise introuvable');
    if (issuance.status === 'DRAFT') throw new ApiError(400, 'Finalisez la remise avant l’envoi');

    let token = issuance.signToken;
    if (!token) {
      token = generateShareToken();
      await prisma.uniformIssuance.update({
        where: { id: issuance.id },
        data: { signToken: token, signTokenExpiresAt: getTokenExpiration(SIGN_TOKEN_DAYS) },
      });
    }

    const employee = await prisma.employee.findUnique({ where: { id: issuance.employeeId } });
    const result = await sendSignatureSms({
      phone: employee?.phone,
      email: employee?.email,
      firstName: employee?.firstName,
      url: `${FRONTEND_URL}/uniformes/signer/${token}`,
      kind: 'pret',
    });

    const updated = await prisma.uniformIssuance.update({
      where: { id: issuance.id },
      data: { signatureStatus: 'SENT', smsSentAt: new Date(), ghlMessageId: result.messageId ?? null },
    });
    res.json({ message: 'SMS envoyé', data: updated });
  } catch (error) {
    next(error);
  }
};

export const counterSignIssuance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { employeeSignatureBase64, employerSignatureBase64, signedByName, consents } = req.body;
    const issuance = await prisma.uniformIssuance.findUnique({ where: { id: req.params.id } });
    if (!issuance) throw new ApiError(404, 'Remise introuvable');
    if (issuance.status === 'DRAFT') throw new ApiError(400, 'Finalisez la remise avant la signature');

    const data: any = {};
    if (employeeSignatureBase64) {
      data.employeeSignatureStoragePath = await uploadSignaturePng(
        employeeSignatureBase64,
        `signatures/issuances/${issuance.id}-employee.png`
      );
      data.signatureStatus = 'SIGNED';
      data.signatureMethod = 'COUNTER';
      data.signedAt = new Date();
      data.signedByName = signedByName ?? null;
      data.signToken = null;
      data.signTokenExpiresAt = null;
      if (consents) {
        data.payrollConsentAccepted = !!consents.payroll;
        data.uniformPolicyConsentAccepted = !!consents.policy;
        data.fitAttested = !!consents.fit;
      }
    }
    if (employerSignatureBase64) {
      data.employerSignatureStoragePath = await uploadSignaturePng(
        employerSignatureBase64,
        `signatures/issuances/${issuance.id}-employer.png`
      );
    }
    if (Object.keys(data).length === 0) throw new ApiError(400, 'Aucune signature fournie');

    const updated = await prisma.uniformIssuance.update({ where: { id: issuance.id }, data });

    try {
      const pdf = await generateIssuancePdf(issuance.id);
      const { key } = await uploadBufferToR2(pdf, `forms/issuances/${issuance.id}.pdf`, 'application/pdf');
      await prisma.uniformIssuance.update({ where: { id: issuance.id }, data: { formPdfStoragePath: key } });
    } catch (e) {
      console.error('PDF remise échoué:', (e as Error).message);
    }

    res.json({ message: 'Signature enregistrée', data: updated });
  } catch (error) {
    next(error);
  }
};

export const cancelIssuance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const issuance = await prisma.uniformIssuance.findUnique({
      where: { id: req.params.id },
      include: { lines: true },
    });
    if (!issuance) throw new ApiError(404, 'Remise introuvable');
    if (issuance.status === 'CANCELLED') throw new ApiError(400, 'Déjà annulée');

    const updated = await prisma.$transaction(async (tx) => {
      // Si déjà sortie du stock, on ré-incrémente (mouvement IN inverse).
      if (issuance.status !== 'DRAFT') {
        for (const line of issuance.lines) {
          if (!line.variantId) continue;
          await applyMovement(tx, {
            variantId: line.variantId,
            type: 'IN',
            quantity: line.quantity,
            // ré-incrémente là où c'était sorti (par ligne ; sinon défaut de la remise)
            location: line.sourceLocation ?? issuance.sourceLocation,
            reason: `Annulation remise ${issuance.id}`,
            issuanceId: issuance.id,
            createdById: userId(req),
          });
        }
      }
      return tx.uniformIssuance.update({ where: { id: issuance.id }, data: { status: 'CANCELLED' } });
    });
    res.json({ message: 'Remise annulée', data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * Clôture fin d'emploi : tout ce qui reste détenu sur cette remise est marqué
 * NOT_RETURNED → génère un retour finalisé (montant dû = clause dernière paie).
 * Le stock n'est PAS ré-incrémenté (l'agent a gardé les pièces).
 */
export const closeTermination = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const issuance = await prisma.uniformIssuance.findUnique({
      where: { id: req.params.id },
      include: { lines: { include: { variant: true } }, returns: { include: { lines: true } } },
    });
    if (!issuance) throw new ApiError(404, 'Remise introuvable');
    if (!['ISSUED', 'PARTIALLY_RETURNED'].includes(issuance.status)) {
      throw new ApiError(400, 'Remise non clôturable dans cet état');
    }

    const result = await closeTerminationCore(issuance, userId(req) ?? null);
    await notifyTerminationClosed(issuance.employeeId);
    res.json({ message: 'Fin d’emploi clôturée — montant dû calculé', data: result });
  } catch (error) {
    next(error);
  }
};

export const getIssuancePdfUrl = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const issuance = await prisma.uniformIssuance.findUnique({ where: { id: req.params.id } });
    if (!issuance) throw new ApiError(404, 'Remise introuvable');
    let key = issuance.formPdfStoragePath;
    if (!key) {
      const pdf = await generateIssuancePdf(issuance.id);
      const uploaded = await uploadBufferToR2(pdf, `forms/issuances/${issuance.id}.pdf`, 'application/pdf');
      key = uploaded.key;
      await prisma.uniformIssuance.update({ where: { id: issuance.id }, data: { formPdfStoragePath: key } });
    }
    const url = await getSignedFileUrl(key, 3600);
    res.json({ data: { url } });
  } catch (error) {
    next(error);
  }
};
