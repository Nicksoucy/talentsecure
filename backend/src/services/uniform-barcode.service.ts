/**
 * Génération des codes-barres (valeurs uniques) et des étiquettes imprimables
 * (Code128 + QR) pour les variantes d'uniforme.
 */
import bwipjs from 'bwip-js';
import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import type { UniformStockLocation } from '@prisma/client';
import { prisma } from '../config/database';

// Alphabet sans caractères ambigus (pas de I, O, 0, 1) — lisible sur étiquette.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Suffixe d'emplacement encodé dans le QR/Code128 de l'étiquette.
//   <code>-F = casier FRONT_OFFICE · <code>-B = bac BACK_OFFICE
// Le code de base (UNI…) ne contient jamais de tiret, donc le split est sûr.
const LOC_SUFFIX: Record<UniformStockLocation, string> = { FRONT_OFFICE: '-F', BACK_OFFICE: '-B' };

/**
 * Sépare un code scanné en (code-barres de base, emplacement).
 * Rétro-compatible : un code sans suffixe -> location null (l'appelant retombe
 * sur l'emplacement par défaut / sélectionné).
 */
export function parseScannedCode(code: string): { barcode: string; location: UniformStockLocation | null } {
  const v = (code || '').trim();
  if (v.endsWith('-F')) return { barcode: v.slice(0, -2), location: 'FRONT_OFFICE' };
  if (v.endsWith('-B')) return { barcode: v.slice(0, -2), location: 'BACK_OFFICE' };
  return { barcode: v, location: null };
}

/** Code encodé dans l'étiquette : base + suffixe d'emplacement (-F/-B), ou base seule. */
export function labelPayload(barcode: string, location?: UniformStockLocation | null): string {
  return barcode + (location ? LOC_SUFFIX[location] : '');
}

export function randomBarcodeValue(): string {
  const bytes = crypto.randomBytes(9);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `UNI${out}`;
}

/**
 * Génère une valeur de code-barres garantie unique en base.
 */
export async function generateUniqueBarcode(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const value = randomBarcodeValue();
    const existing = await prisma.uniformVariant.findUnique({ where: { barcode: value } });
    if (!existing) return value;
  }
  throw new Error('Impossible de générer un code-barres unique après 12 tentatives');
}

export async function renderCode128Png(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text,
    scale: 3,
    height: 12,
    includetext: true,
    textxalign: 'center',
    textsize: 9,
  });
}

export async function renderQrPng(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({ bcid: 'qrcode', text, scale: 3 });
}

function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

export interface LabelData {
  itemName: string;
  size: string;
  barcode: string;
  /** Si défini : encode -F/-B dans le code et affiche la légende casier/bac. */
  location?: UniformStockLocation;
}

const LOC_CAPTION: Record<UniformStockLocation, string> = {
  FRONT_OFFICE: 'FRONT • casier',
  BACK_OFFICE: 'BACK • bac',
};
const LOC_COLOR: Record<UniformStockLocation, string> = {
  FRONT_OFFICE: '#1565c0', // bleu
  BACK_OFFICE: '#b26a00', // ambre
};

/**
 * Rend une feuille A4 d'étiquettes (3 colonnes), chaque étiquette portant le
 * nom du morceau, la grandeur, l'emplacement (casier/bac), le Code128 et un QR.
 * Le code encodé porte le suffixe d'emplacement (-F/-B) pour que le scan fixe
 * automatiquement la source de la remise.
 */
export async function renderLabelsPdf(labels: LabelData[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 24 });
  const bufferPromise = pdfToBuffer(doc);

  const cols = 3;
  const cellW = (doc.page.width - 48) / cols;
  const cellH = 120;
  const startX = 24;
  let x = startX;
  let y = 24;

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const payload = label.barcode + (label.location ? LOC_SUFFIX[label.location] : '');
    const code128 = await renderCode128Png(payload);
    const qr = await renderQrPng(payload);

    // Cadre
    doc.rect(x, y, cellW - 6, cellH - 6).stroke('#cccccc');

    doc.fontSize(8).fillColor('#000000').font('Helvetica-Bold')
      .text(label.itemName, x + 6, y + 6, { width: cellW - 18, height: 20, ellipsis: true });
    doc.font('Helvetica').fontSize(8).fillColor('#444444')
      .text(`Taille : ${label.size}`, x + 6, y + 24, { width: cellW - 60 });
    // Légende d'emplacement (en couleur, alignée à droite)
    if (label.location) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(LOC_COLOR[label.location])
        .text(LOC_CAPTION[label.location], x + 6, y + 24, { width: cellW - 14, align: 'right' });
    }

    // Code128
    doc.image(code128, x + 6, y + 42, { width: cellW - 40, height: 36 });
    // QR
    doc.image(qr, x + cellW - 34, y + 42, { width: 28, height: 28 });

    doc.font('Helvetica').fontSize(7).fillColor('#000000')
      .text(payload, x + 6, y + 84, { width: cellW - 18 });

    // Avance la grille
    x += cellW;
    if ((i + 1) % cols === 0) {
      x = startX;
      y += cellH;
      if (y + cellH > doc.page.height - 24 && i < labels.length - 1) {
        doc.addPage();
        y = 24;
      }
    }
  }

  doc.end();
  return bufferPromise;
}
