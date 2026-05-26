/**
 * Génération des PDF reproduisant les formulaires XGuard (prêt / retour),
 * avec les coûts, totaux, textes de consentement et signatures embarquées.
 */
import axios from 'axios';
import PDFDocument from 'pdfkit';
import { prisma } from '../config/database';
import { getSignedFileUrl } from './r2.service';
import {
  UNIFORM_CONSENT_PAYROLL,
  UNIFORM_CONSENT_POLICY,
  UNIFORM_FIT_ATTESTATION,
} from '../constants/uniform';
import { UNIFORM_POLICY_PHOTOS } from '../constants/uniform-photos';

function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

async function fetchR2Image(key?: string | null): Promise<Buffer | null> {
  if (!key) return null;
  try {
    const url = await getSignedFileUrl(key, 300);
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
    return Buffer.from(r.data);
  } catch {
    return null;
  }
}

const money = (n: number) => `$ ${n.toFixed(2)}`;
const divisionLabel = (d: string) => (d === 'SIGNALISATION' ? 'Signalisation' : 'Sécurité');

function header(doc: PDFKit.PDFDocument, title: string) {
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#1b2a4a').text('XGUARD SÉCURITÉ', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(12).fillColor('#000000').text(title, { align: 'center' });
  doc.moveDown(0.8);
}

interface RenderLine {
  name: string;
  size: string;
  quantity: number;
  unitCost: number;
  condition?: string;
}

function table(doc: PDFKit.PDFDocument, lines: RenderLine[], withCondition: boolean) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const cols = withCondition
    ? [{ k: 'name', w: 0.34 }, { k: 'size', w: 0.12 }, { k: 'qty', w: 0.1 }, { k: 'cond', w: 0.16 }, { k: 'unit', w: 0.14 }, { k: 'total', w: 0.14 }]
    : [{ k: 'name', w: 0.4 }, { k: 'size', w: 0.14 }, { k: 'qty', w: 0.12 }, { k: 'unit', w: 0.17 }, { k: 'total', w: 0.17 }];
  const headers: Record<string, string> = {
    name: "Pièce", size: 'Taille', qty: 'Qté', cond: 'État', unit: 'Coût unit.', total: 'Total',
  };

  let y = doc.y;
  const rowH = 18;
  // header row
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');
  let x = left;
  for (const c of cols) {
    doc.rect(x, y, c.w * width, rowH).fillAndStroke('#e8e8e8', '#bbbbbb');
    doc.fillColor('#000000').text(headers[c.k], x + 3, y + 5, { width: c.w * width - 6 });
    x += c.w * width;
  }
  y += rowH;

  doc.font('Helvetica').fontSize(9);
  let grand = 0;
  for (const line of lines) {
    const total = line.quantity * line.unitCost;
    grand += total;
    x = left;
    if (y + rowH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.y;
    }
    const values: Record<string, string> = {
      name: line.name,
      size: line.size,
      qty: String(line.quantity),
      cond: line.condition ?? '',
      unit: money(line.unitCost),
      total: money(total),
    };
    for (const c of cols) {
      doc.rect(x, y, c.w * width, rowH).stroke('#dddddd');
      doc.fillColor('#000000').text(values[c.k], x + 3, y + 5, { width: c.w * width - 6, ellipsis: true });
      x += c.w * width;
    }
    y += rowH;
  }
  doc.y = y + 6;
  doc.font('Helvetica-Bold').fontSize(10).text(`Coût total : ${money(grand)}`, { align: 'right' });
  doc.moveDown(0.6);
  return grand;
}

async function signatureBlock(
  doc: PDFKit.PDFDocument,
  opts: {
    employeeKey?: string | null;
    employerKey?: string | null;
    signedByName?: string | null;
    signedAt?: Date | null;
    method?: string | null;
  }
) {
  doc.moveDown(0.5);
  const empImg = await fetchR2Image(opts.employeeKey);
  const emprImg = await fetchR2Image(opts.employerKey);
  const startY = doc.y;
  const colW = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2;
  const left = doc.page.margins.left;

  doc.font('Helvetica').fontSize(9).fillColor('#000000');
  doc.text("Signature de l'employé :", left, startY);
  if (empImg) doc.image(empImg, left, startY + 12, { fit: [colW - 20, 50] });
  doc.text("Signature de l'employeur :", left + colW, startY);
  if (emprImg) doc.image(emprImg, left + colW, startY + 12, { fit: [colW - 20, 50] });

  doc.y = startY + 70;
  const meta: string[] = [];
  if (opts.signedByName) meta.push(`Signé par : ${opts.signedByName}`);
  if (opts.signedAt) meta.push(`Date : ${new Date(opts.signedAt).toLocaleString('fr-CA')}`);
  if (opts.method) meta.push(`Méthode : ${opts.method === 'REMOTE_SMS' ? 'SMS' : 'Comptoir'}`);
  if (meta.length) doc.fontSize(8).fillColor('#444444').text(meta.join('   •   '), left);
}

export async function generateIssuancePdf(issuanceId: string): Promise<Buffer> {
  const issuance = await prisma.uniformIssuance.findUnique({
    where: { id: issuanceId },
    include: { lines: { include: { variant: { include: { item: true } } } } },
  });
  if (!issuance) throw new Error('Remise introuvable');
  const employee = await prisma.employee.findUnique({ where: { id: issuance.employeeId } });

  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const out = pdfToBuffer(doc);

  header(doc, "FORMULAIRE DE PRÊT D'UNIFORME/ÉQUIPEMENT");
  doc.font('Helvetica').fontSize(10).fillColor('#000000');
  doc.text(`Nom de l'employé(e) : ${employee ? `${employee.firstName} ${employee.lastName}` : issuance.employeeId}`);
  doc.text(`Division : ${divisionLabel(issuance.division)}`);
  doc.text(`Date : ${new Date(issuance.issuedAt ?? issuance.createdAt).toLocaleDateString('fr-CA')}`);
  doc.moveDown(0.6);

  const lines: RenderLine[] = issuance.lines.map((l) => ({
    name: l.variant ? l.variant.item.name : (l.customItemName || 'Autre'),
    size: l.variant ? l.variant.size : '—',
    quantity: l.quantity,
    unitCost: Number(l.unitCostSnapshot),
  }));
  table(doc, lines, false);

  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(8).fillColor('#000000').text(UNIFORM_CONSENT_PAYROLL, { align: 'justify' });
  if (issuance.division === 'SECURITE') {
    doc.moveDown(0.4);
    doc.font('Helvetica').text(UNIFORM_CONSENT_POLICY, { align: 'justify' });
    doc.moveDown(0.3);
    doc.font('Helvetica-Oblique').text(UNIFORM_FIT_ATTESTATION);

    // Photos de référence du port de l'uniforme
    doc.moveDown(0.4);
    const left = doc.page.margins.left;
    const gap = 14;
    const pw = 95;
    const ph = 210;
    let py = doc.y;
    if (py + ph > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      py = doc.y;
    }
    UNIFORM_POLICY_PHOTOS.forEach((b64, idx) => {
      try {
        doc.image(Buffer.from(b64, 'base64'), left + idx * (pw + gap), py, { width: pw, height: ph });
      } catch {
        /* image ignorée si invalide */
      }
    });
    doc.y = py + ph + 8;
  }

  await signatureBlock(doc, {
    employeeKey: issuance.employeeSignatureStoragePath,
    employerKey: issuance.employerSignatureStoragePath,
    signedByName: issuance.signedByName,
    signedAt: issuance.signedAt,
    method: issuance.signatureMethod,
  });

  doc.end();
  return out;
}

export async function generateReturnPdf(returnId: string): Promise<Buffer> {
  const ret = await prisma.uniformReturn.findUnique({
    where: { id: returnId },
    include: { lines: { include: { variant: { include: { item: true } } } } },
  });
  if (!ret) throw new Error('Retour introuvable');
  const employee = await prisma.employee.findUnique({ where: { id: ret.employeeId } });

  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const out = pdfToBuffer(doc);

  header(doc, "FORMULAIRE DE RETOUR D'UNIFORME/ÉQUIPEMENT");
  doc.font('Helvetica').fontSize(10).fillColor('#000000');
  doc.text(`Nom de l'employé(e) : ${employee ? `${employee.firstName} ${employee.lastName}` : ret.employeeId}`);
  doc.text(`Date : ${new Date(ret.returnedAt ?? ret.createdAt).toLocaleDateString('fr-CA')}`);
  doc.moveDown(0.6);

  const condLabel: Record<string, string> = {
    GOOD: 'Bon', DAMAGED: 'Endommagé', LOST: 'Perdu', NOT_RETURNED: 'Non retourné',
  };
  const lines: RenderLine[] = ret.lines.map((l) => ({
    name: l.variant ? l.variant.item.name : (l.customItemName || 'Autre'),
    size: l.variant ? l.variant.size : '—',
    quantity: l.quantity,
    unitCost: Number(l.unitReplacementCost),
    condition: condLabel[l.condition] || l.condition,
  }));
  table(doc, lines, true);

  await signatureBlock(doc, {
    employeeKey: ret.employeeSignatureStoragePath,
    employerKey: ret.employerSignatureStoragePath,
    signedByName: ret.signedByName,
    signedAt: ret.signedAt,
    method: ret.signatureMethod,
  });

  doc.end();
  return out;
}
