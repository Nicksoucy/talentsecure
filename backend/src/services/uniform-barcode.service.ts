/**
 * Génération des codes-barres (valeurs uniques) et des étiquettes imprimables
 * (Code128 + QR) pour les variantes d'uniforme.
 */
import bwipjs from 'bwip-js';
import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import { prisma } from '../config/database';

// Alphabet sans caractères ambigus (pas de I, O, 0, 1) — lisible sur étiquette.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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
}

/**
 * Rend une feuille A4 d'étiquettes (3 colonnes), chaque étiquette portant le
 * nom du morceau, la grandeur, le Code128 et un petit QR.
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
    const code128 = await renderCode128Png(label.barcode);
    const qr = await renderQrPng(label.barcode);

    // Cadre
    doc.rect(x, y, cellW - 6, cellH - 6).stroke('#cccccc');

    doc.fontSize(8).fillColor('#000000').font('Helvetica-Bold')
      .text(label.itemName, x + 6, y + 6, { width: cellW - 18, height: 22, ellipsis: true });
    doc.font('Helvetica').fontSize(8).fillColor('#444444')
      .text(`Taille : ${label.size}`, x + 6, y + 26, { width: cellW - 18 });

    // Code128
    doc.image(code128, x + 6, y + 42, { width: cellW - 40, height: 36 });
    // QR
    doc.image(qr, x + cellW - 34, y + 42, { width: 28, height: 28 });

    doc.font('Helvetica').fontSize(7).fillColor('#000000')
      .text(label.barcode, x + 6, y + 84, { width: cellW - 18 });

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
