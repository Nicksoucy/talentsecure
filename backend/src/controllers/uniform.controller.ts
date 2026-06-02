import { Request, Response, NextFunction } from 'express';
import { UniformStockLocation } from '@prisma/client';
import * as XLSX from 'xlsx';
import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';
import { applyMovement, transferStock, computeHoldings, computeAmountOwed } from '../services/uniform-stock.service';
import { generateUniqueBarcode, renderLabelsPdf, LabelData, parseScannedCode, renderQrPng, labelPayload } from '../services/uniform-barcode.service';
import { generateIssuancePdf, generateReturnPdf } from '../services/uniform-pdf.service';
import { uploadBufferToR2, getSignedFileUrl } from '../services/r2.service';
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

/** Ajoute une URL signée (1 h) pour la photo du morceau, si elle existe. */
async function withImageUrl<T extends { imageStoragePath?: string | null }>(
  item: T
): Promise<T & { imageUrl: string | null }> {
  let imageUrl: string | null = null;
  if (item.imageStoragePath) {
    try {
      imageUrl = await getSignedFileUrl(item.imageStoragePath, 3600);
    } catch {
      imageUrl = null;
    }
  }
  return { ...item, imageUrl };
}

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
      include: { variants: { where: { isActive: true }, orderBy: { size: 'asc' }, include: { stockByLocation: true } } },
      // Ordre manuel (sortOrder) d'abord ; division/nom en départage tant que
      // l'utilisateur n'a pas réordonné (sortOrder tous égaux au départ).
      orderBy: [{ sortOrder: 'asc' }, { division: 'asc' }, { name: 'asc' }],
    });
    const data = await Promise.all(items.map(withImageUrl));
    res.json({ data });
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

/** Réordonne les morceaux : sortOrder = position dans la liste reçue. */
export const reorderItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) throw new ApiError(400, 'ids requis');
    await prisma.$transaction(
      ids.map((id, idx) => prisma.uniformItem.update({ where: { id }, data: { sortOrder: idx } }))
    );
    res.json({ message: 'Ordre mis à jour' });
  } catch (error) {
    next(error);
  }
};

export const getItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await prisma.uniformItem.findUnique({
      where: { id: req.params.id },
      include: { variants: { where: { isActive: true }, orderBy: { size: 'asc' }, include: { stockByLocation: true } } },
    });
    if (!item) throw new ApiError(404, 'Morceau introuvable');
    res.json({ data: await withImageUrl(item) });
  } catch (error) {
    next(error);
  }
};

/** Téléverse / remplace la photo d'un morceau (vers R2). */
export const uploadItemImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const file = (req as any).file;
    if (!file) throw new ApiError(400, 'Image requise (champ "image")');
    const item = await prisma.uniformItem.findUnique({ where: { id } });
    if (!item) throw new ApiError(404, 'Morceau introuvable');
    // Clé fixe par morceau : un nouvel upload remplace l'ancienne photo.
    const { key } = await uploadBufferToR2(file.buffer, `uniforms/items/${id}`, file.mimetype || 'image/jpeg');
    await prisma.uniformItem.update({ where: { id }, data: { imageStoragePath: key } });
    const imageUrl = await getSignedFileUrl(key, 3600);
    res.json({ message: 'Photo enregistrée', data: { imageStoragePath: key, imageUrl } });
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
      include: { item: true, stockByLocation: true },
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
    const { size, replacementCost, reorderThreshold, sku, emplacement } = req.body;
    const barcode = await generateUniqueBarcode();
    const variant = await prisma.uniformVariant.create({
      data: {
        itemId: item.id,
        size: size || 'Unique',
        sku: sku ?? null,
        emplacement: emplacement ?? null,
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
    const { size, replacementCost, reorderThreshold, sku, isActive, emplacement } = req.body;
    const data: any = {};
    if (size !== undefined) data.size = size;
    if (replacementCost !== undefined) data.replacementCost = replacementCost;
    if (reorderThreshold !== undefined) data.reorderThreshold = reorderThreshold;
    if (sku !== undefined) data.sku = sku;
    if (isActive !== undefined) data.isActive = isActive;
    if (emplacement !== undefined) data.emplacement = emplacement;
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
    // Le code scanné peut porter un suffixe d'emplacement (-F casier / -B bac).
    const { barcode, location } = parseScannedCode(req.params.barcode);
    const variant = await prisma.uniformVariant.findUnique({
      where: { barcode },
      include: { item: true, stockByLocation: true },
    });
    if (!variant) throw new ApiError(404, 'Aucune variante pour ce code-barres');
    res.json({ data: variant, location });
  } catch (error) {
    next(error);
  }
};

// ===========================================================================
// ÉTIQUETTES
// ===========================================================================

export const variantLabel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const loc = req.query.location as 'FRONT_OFFICE' | 'BACK_OFFICE' | undefined;
    if (loc && loc !== 'FRONT_OFFICE' && loc !== 'BACK_OFFICE') throw new ApiError(400, 'location invalide');
    const format = req.query.format === 'box' ? 'box' : 'standard';
    const variant = await prisma.uniformVariant.findUnique({
      where: { id: req.params.variantId },
      include: { item: true },
    });
    if (!variant) throw new ApiError(404, 'Variante introuvable');
    const base = { itemName: variant.item.name, size: variant.size, barcode: variant.barcode };
    // ?location=… -> une seule étiquette (casier OU bac) ; sinon les deux.
    const labels: LabelData[] = loc
      ? [{ ...base, location: loc }]
      : [{ ...base, location: 'FRONT_OFFICE' }, { ...base, location: 'BACK_OFFICE' }];
    const pdf = await renderLabelsPdf(labels, { format });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="etiquette-${variant.barcode}${loc ? '-' + loc : ''}.pdf"`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
};

/** Image PNG du QR d'une variante pour un emplacement (aperçu à l'écran). */
export const variantQr = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const loc = req.query.location as 'FRONT_OFFICE' | 'BACK_OFFICE' | undefined;
    if (loc && loc !== 'FRONT_OFFICE' && loc !== 'BACK_OFFICE') throw new ApiError(400, 'location invalide');
    const variant = await prisma.uniformVariant.findUnique({ where: { id: req.params.variantId } });
    if (!variant) throw new ApiError(404, 'Variante introuvable');
    const png = await renderQrPng(labelPayload(variant.barcode, loc));
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(png);
  } catch (error) {
    next(error);
  }
};

export const labelsSheet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { variantIds, locations, format } = req.body as {
      variantIds: string[];
      locations?: ('BACK_OFFICE' | 'FRONT_OFFICE')[];
      format?: 'standard' | 'box';
    };
    if (!Array.isArray(variantIds) || variantIds.length === 0) {
      throw new ApiError(400, 'variantIds requis');
    }
    // Par défaut : une étiquette FRONT (casier) + une BACK (bac) par variante.
    const locs: ('FRONT_OFFICE' | 'BACK_OFFICE')[] =
      Array.isArray(locations) && locations.length ? locations : ['FRONT_OFFICE', 'BACK_OFFICE'];
    const variants = await prisma.uniformVariant.findMany({
      where: { id: { in: variantIds } },
      include: { item: true },
    });
    const labels: LabelData[] = variants.flatMap((v) =>
      locs.map((loc) => ({
        itemName: v.item.name,
        size: v.size,
        barcode: v.barcode,
        location: loc,
      }))
    );
    const pdf = await renderLabelsPdf(labels, { format: format === 'box' ? 'box' : 'standard' });
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

/** Valide un emplacement venant du body ; défaut BACK_OFFICE (réappro/achat
 * arrive à la réserve). */
function parseLocation(value: unknown): UniformStockLocation {
  if (value === 'FRONT_OFFICE' || value === 'BACK_OFFICE') return value;
  if (value === undefined || value === null) return 'BACK_OFFICE';
  throw new ApiError(400, 'location invalide (BACK_OFFICE | FRONT_OFFICE)');
}

export const replenishVariant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { quantity, reason, location } = req.body;
    if (!quantity || quantity <= 0) throw new ApiError(400, 'Quantité positive requise');
    const loc = parseLocation(location);
    const result = await prisma.$transaction((tx) =>
      applyMovement(tx, {
        variantId: req.params.variantId,
        type: 'IN',
        quantity,
        location: loc,
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
    const { quantity, reason, location } = req.body;
    if (quantity === undefined || quantity === 0) throw new ApiError(400, 'Quantité (signée) requise');
    const loc = parseLocation(location);
    const result = await prisma.$transaction((tx) =>
      applyMovement(tx, {
        variantId: req.params.variantId,
        type: 'ADJUST',
        quantity,
        location: loc,
        reason: reason ?? 'Ajustement inventaire',
        createdById: userId(req),
      })
    );
    res.status(201).json({ message: 'Inventaire ajusté', data: result });
  } catch (error) {
    next(error);
  }
};

/** Transfert de stock entre emplacements (back ↔ front). « Mêmes quantités,
 * juste déplacées » : le total reste inchangé, les buckets bougent. */
export const transferVariant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { quantity, from, to, reason } = req.body;
    if (!quantity || quantity <= 0) throw new ApiError(400, 'Quantité positive requise');
    const fromLoc = parseLocation(from);
    const toLoc = parseLocation(to);
    const result = await prisma.$transaction((tx) =>
      transferStock(tx, {
        variantId: req.params.variantId,
        quantity,
        from: fromLoc,
        to: toLoc,
        reason: reason ?? null,
        createdById: userId(req),
      })
    );
    res.status(201).json({ message: 'Transfert effectué', data: result });
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
      // Exclut aussi les variantes des morceaux archivés (item.isActive = false).
      where: { isActive: true, item: { isActive: true } },
      include: { item: true, stockByLocation: true },
      orderBy: [{ item: { sortOrder: 'asc' } }, { item: { name: 'asc' } }, { size: 'asc' }],
    });
    let totalUnits = 0;
    let totalValue = 0;
    let totalBackOffice = 0;
    let totalFrontOffice = 0;
    const rows = variants.map((v) => {
      const value = v.quantityOnHand * Number(v.replacementCost);
      const backOffice = v.stockByLocation.find((s) => s.location === 'BACK_OFFICE')?.quantityOnHand ?? 0;
      const frontOffice = v.stockByLocation.find((s) => s.location === 'FRONT_OFFICE')?.quantityOnHand ?? 0;
      totalUnits += v.quantityOnHand;
      totalValue += value;
      totalBackOffice += backOffice;
      totalFrontOffice += frontOffice;
      return {
        variantId: v.id,
        itemId: v.itemId,
        itemName: v.item.name,
        division: v.item.division,
        type: v.item.type,
        isOneSize: v.item.isOneSize,
        sortOrder: v.item.sortOrder,
        size: v.size,
        barcode: v.barcode,
        emplacement: v.emplacement,
        quantityOnHand: v.quantityOnHand,
        backOffice,
        frontOffice,
        replacementCost: Number(v.replacementCost),
        reorderThreshold: v.reorderThreshold,
        value,
        lowStock: v.reorderThreshold != null && v.quantityOnHand <= v.reorderThreshold,
        outOfStock: v.quantityOnHand === 0,
      };
    });
    res.json({ data: { rows, totals: { totalUnits, totalValue, totalBackOffice, totalFrontOffice } } });
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

/**
 * Exporte l'inventaire complet en .xlsx (2 feuilles : Sécurité, Signalisation),
 * format proche du fichier source XGuard : Pièce | QT | (taille | empl.) × 9.
 */
export const exportInventoryXlsx = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
    const variants = await prisma.uniformVariant.findMany({
      where: { isActive: true, item: { isActive: true } },
      include: { item: true, stockByLocation: true },
      orderBy: [{ item: { division: 'asc' } }, { item: { sortOrder: 'asc' } }, { item: { name: 'asc' } }, { size: 'asc' }],
    });
    const locQty = (v: { stockByLocation: { location: string; quantityOnHand: number }[] }, loc: string) =>
      v.stockByLocation.find((s) => s.location === loc)?.quantityOnHand ?? 0;

    type Row = { item: any; variants: any[] };
    const grouped = { SECURITE: new Map<string, Row>(), SIGNALISATION: new Map<string, Row>() };
    for (const v of variants) {
      const map = grouped[v.item.division as 'SECURITE' | 'SIGNALISATION'];
      const e = map.get(v.itemId) || { item: v.item, variants: [] };
      e.variants.push(v);
      map.set(v.itemId, e);
    }

    const buildSheet = (groups: Map<string, Row>) => {
      const aoa: any[][] = [];
      const header: any[] = ["Pièce d'uniforme", 'Type', 'QT', 'QT Back', 'QT Front'];
      for (const s of SIZES) header.push(s, `Empl. ${s}`);
      header.push('Coût unit.', 'Valeur totale');
      aoa.push(header);

      for (const { item, variants } of groups.values()) {
        const totalQty = variants.reduce((s, v) => s + v.quantityOnHand, 0);
        const totalBack = variants.reduce((s, v) => s + locQty(v, 'BACK_OFFICE'), 0);
        const totalFront = variants.reduce((s, v) => s + locQty(v, 'FRONT_OFFICE'), 0);
        const totalVal = variants.reduce((s, v) => s + v.quantityOnHand * Number(v.replacementCost), 0);
        const bySize = new Map(variants.map((v) => [v.size, v]));
        const row: any[] = [item.name, item.type === 'EQUIPEMENT' ? 'Équipement' : 'Uniforme', totalQty, totalBack, totalFront];
        if (item.isOneSize) {
          const uniq = bySize.get('Unique');
          row.push(uniq?.quantityOnHand ?? '', 'Taille unique');
          for (let i = 1; i < SIZES.length; i++) row.push('', '');
        } else {
          for (const s of SIZES) {
            const v = bySize.get(s);
            row.push(v && v.quantityOnHand > 0 ? v.quantityOnHand : '', v?.emplacement ?? '');
          }
        }
        row.push(Number(item.defaultReplacementCost), totalVal);
        aoa.push(row);
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      // Largeurs de colonnes
      ws['!cols'] = [{ wch: 38 }, { wch: 11 }, { wch: 6 }, { wch: 8 }, { wch: 8 }, ...Array(SIZES.length * 2).fill({ wch: 6 }), { wch: 11 }, { wch: 13 }];
      return ws;
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildSheet(grouped.SECURITE), 'Inventaire sécurité');
    XLSX.utils.book_append_sheet(wb, buildSheet(grouped.SIGNALISATION), 'Inventaire signalisation');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const today = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Inventaire_${today}.xlsx"`);
    res.send(buf);
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
    const lines = found.record.lines.map((l: any) => {
      const unitCost = Number(l.unitCostSnapshot ?? l.unitReplacementCost ?? 0);
      return {
        name: l.variant ? l.variant.item.name : l.customItemName || 'Autre',
        size: l.variant ? l.variant.size : '—',
        quantity: l.quantity,
        condition: l.condition,
        unitCost,
        lineTotal: unitCost * l.quantity,
      };
    });
    const total = lines.reduce((s: number, l: any) => s + l.lineTotal, 0);
    res.json({
      data: {
        kind: found.kind,
        alreadySigned: found.record.signatureStatus === 'SIGNED',
        employeeFirstName: employee?.firstName ?? null,
        division: division ?? null,
        lines,
        total,
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

    let storedPdfKey: string | null = null;

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
      const up = await uploadBufferToR2(pdf, `forms/issuances/${found.record.id}.pdf`, 'application/pdf');
      storedPdfKey = up.key;
      await prisma.uniformIssuance.update({ where: { id: found.record.id }, data: { formPdfStoragePath: up.key } });
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
      const up = await uploadBufferToR2(pdf, `forms/returns/${found.record.id}.pdf`, 'application/pdf');
      storedPdfKey = up.key;
      await prisma.uniformReturn.update({ where: { id: found.record.id }, data: { formPdfStoragePath: up.key } });
    }

    let pdfUrl: string | null = null;
    if (storedPdfKey) {
      try {
        pdfUrl = await getSignedFileUrl(storedPdfKey, 3600);
      } catch {
        pdfUrl = null;
      }
    }
    res.json({ message: 'Signature enregistrée. Merci !', pdfUrl });
  } catch (error) {
    next(error);
  }
};
