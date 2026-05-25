import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';
import { applyMovement, computeHoldings, computeAmountOwed } from '../services/uniform-stock.service';
import { generateUniqueBarcode, renderLabelsPdf, LabelData } from '../services/uniform-barcode.service';
import { generateIssuancePdf, generateReturnPdf } from '../services/uniform-pdf.service';
import { uploadBufferToR2 } from '../services/r2.service';
import { uploadSignaturePng } from '../utils/signature';
import { isTokenExpired } from '../utils/token';
import {
  UNIFORM_CONSENT_PAYROLL,
  UNIFORM_CONSENT_POLICY,
  UNIFORM_FIT_ATTESTATION,
} from '../constants/uniform';

const userId = (req: Request): string | undefined => (req.user as any)?.id;

// ===========================================================================
// CATALOGUE — Items
// ===========================================================================

export const listItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { division, type, search, includeInactive } = req.query;
    const where: any = {};
    if (division) where.division = division;
    if (type) where.type = type;
    if (!includeInactive) where.isActive = true;
    if (search) where.name = { contains: search as string, mode: 'insensitive' };

    const items = await prisma.uniformItem.findMany({
      where,
      include: { variants: { orderBy: { size: 'asc' } } },
      orderBy: [{ division: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ data: items });
  } catch (error) {
    next(error);
  }
};

export const createItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { division, type, name, isOneSize, defaultReplacementCost, sortOrder } = req.body;
    const item = await prisma.uniformItem.create({
      data: {
        division,
        type: type || 'UNIFORME',
        name,
        isOneSize: !!isOneSize,
        defaultReplacementCost: defaultReplacementCost ?? 0,
        sortOrder: sortOrder ?? 0,
        createdById: userId(req),
      },
    });
    res.status(201).json({ message: 'Morceau créé', data: item });
  } catch (error) {
    next(error);
  }
};

export const getItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await prisma.uniformItem.findUnique({
      where: { id: req.params.id },
      include: { variants: { orderBy: { size: 'asc' } } },
    });
    if (!item) throw new ApiError(404, 'Morceau introuvable');
    res.json({ data: item });
  } catch (error) {
    next(error);
  }
};

export const updateItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, type, isOneSize, defaultReplacementCost, sortOrder, isActive } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (isOneSize !== undefined) data.isOneSize = isOneSize;
    if (defaultReplacementCost !== undefined) data.defaultReplacementCost = defaultReplacementCost;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (isActive !== undefined) data.isActive = isActive;
    const item = await prisma.uniformItem.update({ where: { id: req.params.id }, data });
    res.json({ message: 'Morceau mis à jour', data: item });
  } catch (error) {
    next(error);
  }
};

export const deleteItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.uniformItem.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: 'Morceau désactivé' });
  } catch (error) {
    next(error);
  }
};

// ===========================================================================
// CATALOGUE — Variants
// ===========================================================================

export const listVariants = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemId, search, lowStock, includeInactive } = req.query;
    const where: any = {};
    if (itemId) where.itemId = itemId;
    if (!includeInactive) where.isActive = true;
    if (search) {
      where.OR = [
        { barcode: { contains: search as string, mode: 'insensitive' } },
        { sku: { contains: search as string, mode: 'insensitive' } },
        { item: { name: { contains: search as string, mode: 'insensitive' } } },
      ];
    }
    let variants = await prisma.uniformVariant.findMany({
      where,
      include: { item: true },
      orderBy: [{ item: { name: 'asc' } }, { size: 'asc' }],
    });
    if (lowStock === 'true') {
      variants = variants.filter(
        (v) => v.reorderThreshold != null && v.quantityOnHand <= v.reorderThreshold
      );
    }
    res.json({ data: variants });
  } catch (error) {
    next(error);
  }
};

export const createVariant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await prisma.uniformItem.findUnique({ where: { id: req.params.id } });
    if (!item) throw new ApiError(404, 'Morceau introuvable');
    const { size, replacementCost, reorderThreshold, sku } = req.body;
    const barcode = await generateUniqueBarcode();
    const variant = await prisma.uniformVariant.create({
      data: {
        itemId: item.id,
        size: size || 'Unique',
        sku: sku ?? null,
        barcode,
        replacementCost: replacementCost ?? item.defaultReplacementCost,
        reorderThreshold: reorderThreshold ?? null,
      },
      include: { item: true },
    });
    res.status(201).json({ message: 'Variante créée', data: variant });
  } catch (error) {
    next(error);
  }
};

export const updateVariant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { size, replacementCost, reorderThreshold, sku, isActive } = req.body;
    const data: any = {};
    if (size !== undefined) data.size = size;
    if (replacementCost !== undefined) data.replacementCost = replacementCost;
    if (reorderThreshold !== undefined) data.reorderThreshold = reorderThreshold;
    if (sku !== undefined) data.sku = sku;
    if (isActive !== undefined) data.isActive = isActive;
    const variant = await prisma.uniformVariant.update({
      where: { id: req.params.variantId },
      data,
      include: { item: true },
    });
    res.json({ message: 'Variante mise à jour', data: variant });
  } catch (error) {
    next(error);
  }
};

export const deleteVariant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.uniformVariant.update({
      where: { id: req.params.variantId },
      data: { isActive: false },
    });
    res.json({ message: 'Variante désactivée' });
  } catch (error) {
    next(error);
  }
};

export const getVariantByBarcode = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const variant = await prisma.uniformVariant.findUnique({
      where: { barcode: req.params.barcode },
      include: { item: true },
    });
    if (!variant) throw new ApiError(404, 'Aucune variante pour ce code-barres');
    res.json({ data: variant });
  } catch (error) {
    next(error);
  }
};

// ===========================================================================
// ÉTIQUETTES
// ===========================================================================

export const variantLabel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const variant = await prisma.uniformVariant.findUnique({
      where: { id: req.params.variantId },
      include: { item: true },
    });
    if (!variant) throw new ApiError(404, 'Variante introuvable');
    const pdf = await renderLabelsPdf([
      { itemName: variant.item.name, size: variant.size, barcode: variant.barcode },
    ]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="etiquette-${variant.barcode}.pdf"`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
};

export const labelsSheet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { variantIds } = req.body as { variantIds: string[] };
    if (!Array.isArray(variantIds) || variantIds.length === 0) {
      throw new ApiError(400, 'variantIds requis');
    }
    const variants = await prisma.uniformVariant.findMany({
      where: { id: { in: variantIds } },
      include: { item: true },
    });
    const labels: LabelData[] = variants.map((v) => ({
      itemName: v.item.name,
      size: v.size,
      barcode: v.barcode,
    }));
    const pdf = await renderLabelsPdf(labels);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="etiquettes.pdf"');
    res.send(pdf);
  } catch (error) {
    next(error);
  }
};

// ===========================================================================
// INVENTAIRE — mouvements
// ===========================================================================

export const listMovements = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { variantId, type, page = 1, limit = 50 } = req.query;
    const where: any = {};
    if (variantId) where.variantId = variantId;
    if (type) where.type = type;
    const skip = (Number(page) - 1) * Number(limit);
    const [total, movements] = await prisma.$transaction([
      prisma.uniformStockMovement.count({ where }),
      prisma.uniformStockMovement.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { variant: { include: { item: true } } },
      }),
    ]);
    res.json({
      data: movements,
      pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    next(error);
  }
};

export const replenishVariant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { quantity, reason } = req.body;
    if (!quantity || quantity <= 0) throw new ApiError(400, 'Quantité positive requise');
    const result = await prisma.$transaction((tx) =>
      applyMovement(tx, {
        variantId: req.params.variantId,
        type: 'IN',
        quantity,
        reason: reason ?? 'Réapprovisionnement',
        createdById: userId(req),
      })
    );
    res.status(201).json({ message: 'Stock ajouté', data: result });
  } catch (error) {
    next(error);
  }
};

export const adjustVariant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { quantity, reason } = req.body;
    if (quantity === undefined || quantity === 0) throw new ApiError(400, 'Quantité (signée) requise');
    const result = await prisma.$transaction((tx) =>
      applyMovement(tx, {
        variantId: req.params.variantId,
        type: 'ADJUST',
        quantity,
        reason: reason ?? 'Ajustement inventaire',
        createdById: userId(req),
      })
    );
    res.status(201).json({ message: 'Inventaire ajusté', data: result });
  } catch (error) {
    next(error);
  }
};

// ===========================================================================
// FICHE AGENT & RÈGLEMENTS
// ===========================================================================

export const employeeFiche = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { employeeId } = req.params;
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    const [holdings, owed, issuances, returns, settlements] = await Promise.all([
      computeHoldings(employeeId),
      computeAmountOwed(employeeId),
      prisma.uniformIssuance.findMany({
        where: { employeeId },
        include: { lines: { include: { variant: { include: { item: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.uniformReturn.findMany({
        where: { employeeId },
        include: { lines: { include: { variant: { include: { item: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.uniformDebtSettlement.findMany({ where: { employeeId }, orderBy: { createdAt: 'desc' } }),
    ]);
    res.json({ data: { employee, holdings, owed, issuances, returns, settlements } });
  } catch (error) {
    next(error);
  }
};

export const createSettlement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, method, notes } = req.body;
    if (!amount || amount <= 0) throw new ApiError(400, 'Montant positif requis');
    const settlement = await prisma.uniformDebtSettlement.create({
      data: {
        employeeId: req.params.employeeId,
        amount,
        method: method ?? null,
        notes: notes ?? null,
        createdById: userId(req),
      },
    });
    res.status(201).json({ message: 'Règlement enregistré', data: settlement });
  } catch (error) {
    next(error);
  }
};

// ===========================================================================
// RAPPORTS
// ===========================================================================

export const reportStock = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const variants = await prisma.uniformVariant.findMany({
      where: { isActive: true },
      include: { item: true },
      orderBy: [{ item: { name: 'asc' } }, { size: 'asc' }],
    });
    let totalUnits = 0;
    let totalValue = 0;
    const rows = variants.map((v) => {
      const value = v.quantityOnHand * Number(v.replacementCost);
      totalUnits += v.quantityOnHand;
      totalValue += value;
      return {
        variantId: v.id,
        itemName: v.item.name,
        division: v.item.division,
        type: v.item.type,
        size: v.size,
        barcode: v.barcode,
        quantityOnHand: v.quantityOnHand,
        replacementCost: Number(v.replacementCost),
        value,
        lowStock: v.reorderThreshold != null && v.quantityOnHand <= v.reorderThreshold,
      };
    });
    res.json({ data: { rows, totals: { totalUnits, totalValue } } });
  } catch (error) {
    next(error);
  }
};

export const reportOverdue = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const issuances = await prisma.uniformIssuance.findMany({
      where: { status: { in: ['ISSUED', 'PARTIALLY_RETURNED'] }, dueReturnAt: { lt: now } },
      include: { lines: true },
      orderBy: { dueReturnAt: 'asc' },
    });
    const employeeIds = [...new Set(issuances.map((i) => i.employeeId))];
    const employees = await prisma.employee.findMany({ where: { id: { in: employeeIds } } });
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const rows = issuances.map((i) => ({
      issuanceId: i.id,
      employeeId: i.employeeId,
      employeeName: empMap.get(i.employeeId)
        ? `${empMap.get(i.employeeId)!.firstName} ${empMap.get(i.employeeId)!.lastName}`
        : i.employeeId,
      division: i.division,
      dueReturnAt: i.dueReturnAt,
      itemsCount: i.lines.reduce((s, l) => s + l.quantity, 0),
      totalLoanCost: Number(i.totalLoanCost),
    }));
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
};

export const reportLosses = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const returns = await prisma.uniformReturn.findMany({
      where: { status: 'RETURNED' },
      include: { lines: { include: { variant: { include: { item: true } } } } },
    });
    const byEmployee = new Map<string, { employeeId: string; cost: number; units: number }>();
    let totalCost = 0;
    let totalUnits = 0;
    for (const ret of returns) {
      for (const line of ret.lines) {
        if (!['DAMAGED', 'LOST', 'NOT_RETURNED'].includes(line.condition)) continue;
        const cost = line.quantity * Number(line.unitReplacementCost);
        totalCost += cost;
        totalUnits += line.quantity;
        const cur = byEmployee.get(ret.employeeId) || { employeeId: ret.employeeId, cost: 0, units: 0 };
        cur.cost += cost;
        cur.units += line.quantity;
        byEmployee.set(ret.employeeId, cur);
      }
    }
    const employeeIds = [...byEmployee.keys()];
    const employees = await prisma.employee.findMany({ where: { id: { in: employeeIds } } });
    const empMap = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
    const rows = [...byEmployee.values()].map((r) => ({
      ...r,
      employeeName: empMap.get(r.employeeId) || r.employeeId,
    }));
    res.json({ data: { rows, totals: { totalCost, totalUnits } } });
  } catch (error) {
    next(error);
  }
};

export const statsSummary = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const [items, variants, activeIssuances, overdue, stockAgg] = await Promise.all([
      prisma.uniformItem.count({ where: { isActive: true } }),
      prisma.uniformVariant.count({ where: { isActive: true } }),
      prisma.uniformIssuance.count({ where: { status: { in: ['ISSUED', 'PARTIALLY_RETURNED'] } } }),
      prisma.uniformIssuance.count({
        where: { status: { in: ['ISSUED', 'PARTIALLY_RETURNED'] }, dueReturnAt: { lt: now } },
      }),
      prisma.uniformVariant.aggregate({ where: { isActive: true }, _sum: { quantityOnHand: true } }),
    ]);
    res.json({
      data: {
        items,
        variants,
        activeIssuances,
        overdue,
        totalUnitsInStock: stockAgg._sum.quantityOnHand ?? 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ===========================================================================
// SIGNATURE PUBLIQUE (sans auth) — prêt OU retour, par token
// ===========================================================================

async function findByToken(token: string) {
  const issuance = await prisma.uniformIssuance.findFirst({
    where: { signToken: token },
    include: { lines: { include: { variant: { include: { item: true } } } } },
  });
  if (issuance) return { kind: 'pret' as const, record: issuance };
  const ret = await prisma.uniformReturn.findFirst({
    where: { signToken: token },
    include: { lines: { include: { variant: { include: { item: true } } } } },
  });
  if (ret) return { kind: 'retour' as const, record: ret };
  return null;
}

export const getSignPayload = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const found = await findByToken(req.params.token);
    if (!found) throw new ApiError(404, 'Lien de signature invalide');
    if (isTokenExpired(found.record.signTokenExpiresAt)) {
      return res.status(410).json({ error: 'Ce lien a expiré' });
    }
    const employee = await prisma.employee.findUnique({ where: { id: found.record.employeeId } });
    const division = (found.record as any).division as string | undefined;
    const lines = found.record.lines.map((l: any) => ({
      name: l.variant ? l.variant.item.name : l.customItemName || 'Autre',
      size: l.variant ? l.variant.size : '—',
      quantity: l.quantity,
      condition: l.condition,
    }));
    res.json({
      data: {
        kind: found.kind,
        alreadySigned: found.record.signatureStatus === 'SIGNED',
        employeeFirstName: employee?.firstName ?? null,
        division: division ?? null,
        lines,
        consents: {
          payroll: UNIFORM_CONSENT_PAYROLL,
          policy: division === 'SECURITE' && found.kind === 'pret' ? UNIFORM_CONSENT_POLICY : null,
          fit: found.kind === 'pret' ? UNIFORM_FIT_ATTESTATION : null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const submitSign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { signatureBase64, signedByName, consents } = req.body as {
      signatureBase64: string;
      signedByName: string;
      consents?: { payroll?: boolean; policy?: boolean; fit?: boolean };
    };
    if (!signatureBase64 || !signedByName) throw new ApiError(400, 'Signature et nom requis');

    const found = await findByToken(req.params.token);
    if (!found) throw new ApiError(404, 'Lien de signature invalide');
    if (isTokenExpired(found.record.signTokenExpiresAt)) {
      return res.status(410).json({ error: 'Ce lien a expiré' });
    }

    if (found.kind === 'pret') {
      const key = await uploadSignaturePng(signatureBase64, `signatures/issuances/${found.record.id}-employee.png`);
      await prisma.uniformIssuance.update({
        where: { id: found.record.id },
        data: {
          employeeSignatureStoragePath: key,
          signatureStatus: 'SIGNED',
          signatureMethod: 'REMOTE_SMS',
          signedAt: new Date(),
          signedByName,
          payrollConsentAccepted: !!consents?.payroll,
          uniformPolicyConsentAccepted: !!consents?.policy,
          fitAttested: !!consents?.fit,
          signToken: null,
          signTokenExpiresAt: null,
        },
      });
      const pdf = await generateIssuancePdf(found.record.id);
      const { key: pdfKey } = await uploadBufferToR2(pdf, `forms/issuances/${found.record.id}.pdf`, 'application/pdf');
      await prisma.uniformIssuance.update({ where: { id: found.record.id }, data: { formPdfStoragePath: pdfKey } });
    } else {
      const key = await uploadSignaturePng(signatureBase64, `signatures/returns/${found.record.id}-employee.png`);
      await prisma.uniformReturn.update({
        where: { id: found.record.id },
        data: {
          employeeSignatureStoragePath: key,
          signatureStatus: 'SIGNED',
          signatureMethod: 'REMOTE_SMS',
          signedAt: new Date(),
          signedByName,
          signToken: null,
          signTokenExpiresAt: null,
        },
      });
      const pdf = await generateReturnPdf(found.record.id);
      const { key: pdfKey } = await uploadBufferToR2(pdf, `forms/returns/${found.record.id}.pdf`, 'application/pdf');
      await prisma.uniformReturn.update({ where: { id: found.record.id }, data: { formPdfStoragePath: pdfKey } });
    }

    res.json({ message: 'Signature enregistrée. Merci !' });
  } catch (error) {
    next(error);
  }
};
