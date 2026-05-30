/**
 * Vérification & réconciliation END-TO-END pour les 84 PDFs des dossiers
 * OneDrive_1_26-05-2026 et OneDrive_2_26-05-2026.
 *
 * Pour chaque PDF :
 *   1) Parse le nom + date du fichier (ex: "20260213 Ceres dorcely.pdf").
 *   2) Trouve l'employé ACTIF correspondant (skip silencieux si NON-ACTIF).
 *   3) Trouve l'UniformIssuance existante pour (employeeId, date) ; la crée
 *      si absente (status=ISSUED, signature COUNTER, papier).
 *   4) Parse le PDF (parse-historical-pdfs.ts logic).
 *   5) Si total parser == total PDF → applique les lignes (overwrite).
 *   6) Upload le PDF original via l'API prod (login admin).
 *   7) Reporte tous les écarts.
 *
 * Env requis pour l'upload : ADMIN_EMAIL, ADMIN_PASSWORD.
 *
 * Usage :
 *   ts-node verify-all-historical-pdfs.ts                # dry-run + report
 *   ts-node verify-all-historical-pdfs.ts --apply        # applique les fix
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { PrismaClient } from '@prisma/client';
import { PDFParse } from 'pdf-parse';
import { PDFDocument, PDFTextField, PDFCheckBox } from 'pdf-lib';
import { SEED_CATALOGUE, type UniformDivisionKey } from '../constants/uniform';

const prisma = new PrismaClient();

const FOLDERS = [
  'C:\\Users\\nicol\\Downloads\\OneDrive_1_26-05-2026',
  'C:\\Users\\nicol\\Downloads\\OneDrive_2_26-05-2026',
];
const API_URL = process.env.API_URL || 'https://talentsecure-572017163659.northamerica-northeast1.run.app';
const APPLY = process.argv.includes('--apply');
const INCLUDE_INACTIF = process.argv.includes('--include-inactif');

// ============================================================================
// PARSER (réutilise la logique de parse-historical-pdfs.ts)
// ============================================================================
function fixOcr(s: string): string {
  return s
    .replace(/Taitte|Tailtte|Taittë|Taitt[eê]|Tail\.te|Tailte/gi, 'Taille')
    .replace(/Totat/gi, 'Total')
    .replace(/Pantaton/gi, 'Pantalon')
    .replace(/mititaire|mil\.itaire|mil itaire/gi, 'militaire')
    .replace(/Chenll'se|Chenll['']se|Chenll['"]se|Chenli['"]se|Chenllse/gi, 'Chemise')
    .replace(/btanche|bl\.anche|bl,anche|b\[anche|bl'anche/gi, 'blanche')
    .replace(/comptet|compLet|compl,et|com /gi, 'complet ')
    .replace(/visibitité|visibitit[eé]|visibil,ité/gi, 'visibilité')
    .replace(/sécurrité|sécurrte|sécurrrté|sécurlté/gi, 'sécurité')
    .replace(/poto|po\[o/gi, 'polo')
    .replace(/Plqque|Plaqque/gi, 'Plaque')
    .replace(/ptuie/gi, 'pluie')
    .replace(/Chandait/gi, 'Chandail')
    .replace(/Casçue/gi, 'Casque')
    .replace(/\bs\s+([0-9oOsS]+[,.][0-9oOsS]{2})/g, '$ $1')
    .replace(/\bS\s+([0-9oOsS]+[,.][0-9oOsS]{2})/g, '$ $1');
}
function normalize(s: string): string {
  return fixOcr(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s()-]/g, ' ').replace(/\s+/g, ' ').trim();
}
function compact(s: string): string {
  const stripped = s.replace(/[^a-zA-Z0-9]/g, '');
  return fixOcr(stripped).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function parseMoney(token: string): number {
  const cleaned = token.replace(/o/gi, '0').replace(/s/gi, '5').replace(/[^0-9,.]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : NaN;
}
const MONEY_PAIR_RE = /\$\s*([\dOoSs]+[,.][\dOoSs]{2})\s*\$\s*([\dOoSs]+[,.][\dOoSs]{2})/g;
const MONEY_RE = /\$\s*([\dOoSs]+[,.][\dOoSs]{2})/g;
const TOTAL_RE = /co[uûaâü]t[^a-z0-9]{0,5}tota[lt\[\(][^a-z0-9]{1,5}du[^a-z0-9]{1,5}pr[eèêé]t[^a-z0-9]{0,15}\$?\s*([\dOoSs]+[,.][\dOoSs]{2})/gi;

interface CatalogItem {
  division: UniformDivisionKey;
  name: string;
  compactName: string;
  type: 'UNIFORME' | 'EQUIPEMENT';
  cost: number;
  sizes?: string[];
  isOneSize?: boolean;
}
const CATALOG: CatalogItem[] = SEED_CATALOGUE.flatMap((d) =>
  d.items.map((it) => ({
    division: d.division,
    name: it.name,
    compactName: compact(it.name),
    type: it.type,
    cost: it.cost,
    sizes: it.sizes,
    isOneSize: it.isOneSize,
  })),
);

interface ParsedLine {
  itemName: string;
  division: UniformDivisionKey;
  type: 'UNIFORME' | 'EQUIPEMENT';
  size: string | null;
  rawSizeToken: string | null;
  quantity: number;
  unitCost: number;
  total: number;
}

function parsePdfText(text: string): ParsedLine[] {
  const fixed = fixOcr(text);
  const lines = fixed.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const found: ParsedLine[] = [];
  let currentSection: UniformDivisionKey = 'SECURITE';
  const seen = new Set<string>();

  for (const line of lines) {
    const cmpLine = compact(line);
    if (cmpLine.includes('divisionsignalisation') || cmpLine.includes('signaisationdivision')) currentSection = 'SIGNALISATION';
    else if (cmpLine.includes('divisionsecurite') || cmpLine.includes('securitedivision')) currentSection = 'SECURITE';

    let matched: CatalogItem | null = null;
    let bestLen = 0;
    for (const item of CATALOG) {
      if (item.division !== currentSection) continue;
      if (cmpLine.startsWith(item.compactName) || cmpLine.includes(item.compactName)) {
        if (item.compactName.length > bestLen) { matched = item; bestLen = item.compactName.length; }
      }
    }
    if (!matched) continue;
    if (seen.has(matched.name)) continue;

    MONEY_PAIR_RE.lastIndex = 0;
    const pairs: { unit: number; total: number }[] = [];
    let mp: RegExpExecArray | null;
    while ((mp = MONEY_PAIR_RE.exec(line)) !== null) pairs.push({ unit: parseMoney(mp[1]), total: parseMoney(mp[2]) });

    let unit: number, total: number;
    if (pairs.length > 0) {
      const [a, b] = [pairs[0].unit, pairs[0].total];
      const aIsCost = Math.abs(a - matched.cost) < 0.01;
      const bIsCost = Math.abs(b - matched.cost) < 0.01;
      if (aIsCost && !bIsCost) { unit = a; total = b; }
      else if (bIsCost && !aIsCost) { unit = b; total = a; }
      else { unit = a; total = b; }
    } else {
      MONEY_RE.lastIndex = 0;
      const singles: number[] = [];
      let ms: RegExpExecArray | null;
      while ((ms = MONEY_RE.exec(line)) !== null) singles.push(parseMoney(ms[1]));
      if (singles.length === 0) continue;
      const hasQtyDigit = /\b[1-9]\d?\b/.test(line.replace(/[\dOoSs]+[,.][\dOoSs]{2}/g, ''));
      if (singles[0] > matched.cost * 1.5) { total = singles[0]; unit = matched.cost; }
      else if (Math.abs(singles[0] - matched.cost) < 0.01) {
        if (hasQtyDigit) { total = singles[0]; unit = matched.cost; }
        else continue;
      } else { total = singles[0]; unit = matched.cost; }
    }
    if (!(total > 0)) continue;

    const SIZE_LIKE = /^(XS|S|M|L|XL|2XL|3XL|4XL|5XL|ZXL|2[8-9]|3\d|4[0-4])$/i;
    let size: string | null = null;
    let rawSizeToken: string | null = null;
    if (matched.isOneSize) size = 'Unique';
    else if (matched.sizes) {
      const lineNoMoney = line.replace(/\$\s*[\dOoSs]+[,.][\dOoSs]{2}/g, ' ').replace(/[Ss]\s*[\dOoSs]+[,.][\dOoSs]{2}/g, ' ');
      const tokens = lineNoMoney.split(/[^a-zA-Z0-9]+/).filter(Boolean);
      for (const t of tokens) {
        if (matched.sizes.includes(t.toUpperCase())) { size = t.toUpperCase(); break; }
      }
      if (!size) {
        for (const t of tokens) {
          if (SIZE_LIKE.test(t)) { rawSizeToken = t.toUpperCase().replace(/^Z/, '2'); break; }
        }
      }
    }
    let quantity = Math.round(total / (unit || matched.cost));
    if (!isFinite(quantity) || quantity <= 0) quantity = 1;
    found.push({ itemName: matched.name, division: matched.division, type: matched.type, size, rawSizeToken, quantity, unitCost: unit || matched.cost, total });
    seen.add(matched.name);
  }
  return found;
}

function detectDivision(text: string): UniformDivisionKey | 'BOTH' | 'UNKNOWN' {
  const matches: number[] = [];
  const fixed = fixOcr(text);
  TOTAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOTAL_RE.exec(fixed)) !== null) matches.push(parseMoney(m[1]));
  if (matches.length < 2) return 'UNKNOWN';
  const [secu, sign] = matches;
  if (secu > 0 && sign === 0) return 'SECURITE';
  if (sign > 0 && secu === 0) return 'SIGNALISATION';
  if (secu > 0 && sign > 0) return 'BOTH';
  return 'UNKNOWN';
}
function extractTotal(text: string, division: UniformDivisionKey): number {
  const fixed = fixOcr(text);
  const matches: number[] = [];
  TOTAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOTAL_RE.exec(fixed)) !== null) matches.push(parseMoney(m[1]));
  if (matches.length === 0) return 0;
  if (matches.length === 1) return matches[0];
  return division === 'SECURITE' ? matches[0] : matches[1];
}

// Form-field parser : utilise les champs AcroForm intacts (PDF rempli directement,
// pas scanné). Bien plus fiable que le text-based parser.
function compactNoParens(s: string): string {
  return s.replace(/[()]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
const CATALOG_BY_COMPACT = new Map(CATALOG.map((c) => [compactNoParens(c.name), c]));

async function parsePdfFormFields(buf: Buffer): Promise<{ lines: ParsedLine[]; totalLoanCost: number; division: UniformDivisionKey | 'BOTH' | 'UNKNOWN' } | null> {
  try {
    const doc = await PDFDocument.load(buf);
    const form = doc.getForm();
    const fields = form.getFields();
    if (fields.length === 0) return null;

    // Index : itemName → { taille, quantite, cout, total }
    const byItem = new Map<string, { taille?: string; quantite?: number; cout?: number; total?: number }>();
    // Champs génériques "Taille unique_N" (one-size SIGNALISATION sans nom d'item) :
    // groupés par suffixe (_2, _3, _4...) puis matchés par coût à l'item SIGNALISATION
    // one-size correspondant (Casque=35, Dossard=25, Chapeau=15).
    const genericOneSize = new Map<string, { quantite?: number; cout?: number; total?: number }>();
    let totalSecurite = 0, totalSignalisation = 0;

    for (const f of fields) {
      const fname = f.getName();
      if (!(f instanceof PDFTextField)) continue;
      const v = (f.getText() || '').trim();
      if (!v) continue;

      // Coût total du prêt — division selon nom du champ (_2 = Signalisation)
      if (/co[uû]t.*total.*pr[eê]t/i.test(fname)) {
        const amt = parseMoney(v);
        if (/signalisation/i.test(fname) || /_2$|_3$/.test(fname)) totalSignalisation = amt;
        else if (/s[eé]curit[eé]/i.test(fname)) totalSecurite = amt;
        else if (totalSecurite === 0) totalSecurite = amt;
        else totalSignalisation = amt;
        continue;
      }

      // Champs génériques "Taille unique_N" (Quantité / Coût unitaire / Total)
      const genMatch = fname.match(/^(Quantit[eé]|Co[uû]t\s*unitaire|Total)\s+Taille\s+unique_(\d+)$/i);
      if (genMatch) {
        const kind = genMatch[1].toLowerCase();
        const suffix = genMatch[2];
        const cur = genericOneSize.get(suffix) || {};
        if (kind.startsWith('quantit')) { const n = parseInt(v, 10); if (isFinite(n)) cur.quantite = n; }
        else if (kind.startsWith('co')) cur.cout = parseMoney(v);
        else if (kind === 'total') cur.total = parseMoney(v);
        genericOneSize.set(suffix, cur);
        continue;
      }

      // Champs d'item : Taille / Quantité / Coût unitaire / Total <ItemName>
      const m = fname.match(/^(Taille(?:\s*unique)?|Quantit[eé]|Co[uû]t\s*unitaire|Total)\s*(.+)$/i);
      if (!m) continue;
      const kind = m[1].toLowerCase().replace(/\s+unique$/i, '').trim();
      const itemNameRaw = m[2].trim();
      const cmp = compactNoParens(itemNameRaw);
      const catItem = CATALOG_BY_COMPACT.get(cmp);
      if (!catItem) continue;
      const key = catItem.name;
      const cur = byItem.get(key) || {};
      if (kind.startsWith('taille')) cur.taille = v;
      else if (kind.startsWith('quantit')) { const n = parseInt(v, 10); if (isFinite(n)) cur.quantite = n; }
      else if (kind.startsWith('co')) cur.cout = parseMoney(v);
      else if (kind === 'total') cur.total = parseMoney(v);
      byItem.set(key, cur);
    }

    const lines: ParsedLine[] = [];
    for (const [itemName, data] of byItem) {
      if (!data.total || data.total <= 0) continue;
      const catItem = CATALOG.find((c) => c.name === itemName)!;
      const unitCost = data.cout || catItem.cost;
      const quantity = data.quantite || Math.max(1, Math.round(data.total / unitCost));
      let size: string | null = null;
      let rawSizeToken: string | null = null;
      if (catItem.isOneSize) size = 'Unique';
      else if (catItem.sizes && data.taille) {
        const upper = data.taille.toUpperCase();
        if (catItem.sizes.includes(upper)) size = upper;
        else rawSizeToken = upper;
      } else if (data.taille) {
        rawSizeToken = data.taille.toUpperCase();
      }
      lines.push({ itemName, division: catItem.division, type: catItem.type, size, rawSizeToken, quantity, unitCost, total: data.total });
    }

    // Items SIGNALISATION one-size génériques : matche par coût.
    const signalisationOneSize = CATALOG.filter((c) => c.division === 'SIGNALISATION' && c.isOneSize);
    for (const [, data] of genericOneSize) {
      if (!data.total || data.total <= 0) continue;
      const unitCost = data.cout || 0;
      const cat = signalisationOneSize.find((c) => Math.abs(c.cost - unitCost) < 0.01);
      if (!cat) continue;
      const quantity = data.quantite || Math.max(1, Math.round(data.total / unitCost));
      lines.push({ itemName: cat.name, division: 'SIGNALISATION', type: cat.type, size: 'Unique', rawSizeToken: null, quantity, unitCost, total: data.total });
    }

    let division: UniformDivisionKey | 'BOTH' | 'UNKNOWN' = 'UNKNOWN';
    if (totalSecurite > 0 && totalSignalisation === 0) division = 'SECURITE';
    else if (totalSignalisation > 0 && totalSecurite === 0) division = 'SIGNALISATION';
    else if (totalSecurite > 0 && totalSignalisation > 0) division = 'BOTH';
    else {
      const secuLines = lines.filter((l) => l.division === 'SECURITE').reduce((s, l) => s + l.total, 0);
      const signLines = lines.filter((l) => l.division === 'SIGNALISATION').reduce((s, l) => s + l.total, 0);
      if (secuLines > 0 && signLines === 0) division = 'SECURITE';
      else if (signLines > 0 && secuLines === 0) division = 'SIGNALISATION';
    }

    const totalLoanCost = division === 'SIGNALISATION' ? totalSignalisation
                        : division === 'BOTH' ? (totalSecurite + totalSignalisation)
                        : totalSecurite;
    return { lines, totalLoanCost, division };
  } catch {
    return null;
  }
}

async function parsePdfFile(pdfPath: string) {
  const buf = fs.readFileSync(pdfPath);

  // 1) Essai form-field d'abord (PDF rempli, non scanné)
  const fromForm = await parsePdfFormFields(buf);
  if (fromForm && fromForm.lines.length > 0) {
    const expectedDiv: UniformDivisionKey = fromForm.division === 'SIGNALISATION' ? 'SIGNALISATION' : 'SECURITE';
    const filtered = fromForm.division === 'BOTH' ? fromForm.lines : fromForm.lines.filter((l) => l.division === expectedDiv);
    const computedTotal = filtered.reduce((s, l) => s + l.total, 0);
    return {
      division: fromForm.division,
      totalLoanCost: fromForm.totalLoanCost,
      computedTotal,
      match: fromForm.totalLoanCost > 0 && Math.abs(computedTotal - fromForm.totalLoanCost) < 0.5,
      lines: filtered,
      expectedDiv,
      source: 'form-fields' as const,
    };
  }

  // 2) Sinon, fallback text-based (PDFs scannés/OCR)
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const result = await parser.getText();
  const pages = result.pages || [];
  const text = pages.map((p: any) => p.text || '').join('\n');
  let division = detectDivision(text);
  let lines = parsePdfText(text);
  if (division === 'UNKNOWN') {
    const secuTotal = lines.filter((l) => l.division === 'SECURITE').reduce((s, l) => s + l.total, 0);
    const signTotal = lines.filter((l) => l.division === 'SIGNALISATION').reduce((s, l) => s + l.total, 0);
    if (secuTotal > 0 && signTotal === 0) division = 'SECURITE';
    else if (signTotal > 0 && secuTotal === 0) division = 'SIGNALISATION';
    else if (secuTotal > 0 && signTotal > 0) division = 'BOTH';
  }
  const expectedDiv: UniformDivisionKey = division === 'SIGNALISATION' ? 'SIGNALISATION' : 'SECURITE';
  const filtered = division === 'BOTH' ? lines : lines.filter((l) => l.division === expectedDiv);
  const computedTotal = filtered.reduce((s, l) => s + l.total, 0);
  const totalLoanCost = extractTotal(text, expectedDiv);
  return { division, totalLoanCost, computedTotal, match: totalLoanCost > 0 && Math.abs(computedTotal - totalLoanCost) < 0.5, lines: filtered, expectedDiv, source: 'text' as const };
}

// ============================================================================
// MATCHING EMPLOYÉ
// ============================================================================
function normName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

let allEmployees: { id: string; firstName: string; lastName: string; status: string }[] = [];
async function loadEmployees() {
  allEmployees = await prisma.employee.findMany({ select: { id: true, firstName: true, lastName: true, status: true } });
}
function findEmployee(name: string) {
  const tokens = normName(name).split(' ').filter((t) => t.length >= 2);
  if (tokens.length < 2) return null;
  // Match perfectionné : score sur tokens
  let best: { score: number; emp: any } | null = null;
  for (const e of allEmployees) {
    const full = normName(`${e.firstName} ${e.lastName}`);
    let score = 0;
    for (const t of tokens) if (full.includes(t)) score++;
    if (score === tokens.length) return e;
    if (score >= Math.max(2, tokens.length - 1) && (!best || score > best.score)) best = { score, emp: e };
  }
  return best?.emp ?? null;
}

// ============================================================================
// COMPARE & APPLY
// ============================================================================
function dbLineSignature(l: any): string {
  const name = l.variant?.item?.name || l.customItemName || '(unknown)';
  const size = l.variant?.size || '';
  return `${name}|${size}|${l.quantity}`;
}
function parsedLineSignature(l: ParsedLine, resolvedSize: string | null): string {
  return `${l.itemName}|${resolvedSize || l.size || l.rawSizeToken || ''}|${l.quantity}`;
}

async function resolveVariantSize(itemName: string, size: string | null, rawSize: string | null): Promise<{ variantId: string | null; matchedSize: string | null }> {
  const item = await prisma.uniformItem.findFirst({
    where: { name: itemName },
    include: { variants: { where: { isActive: true } } },
  });
  if (!item) return { variantId: null, matchedSize: null };
  const variants = item.variants;
  const trySize = (s: string | null) => s ? variants.find((v) => v.size.toUpperCase() === s.toUpperCase()) : null;
  let v = trySize(size); if (v) return { variantId: v.id, matchedSize: v.size };
  v = trySize(rawSize); if (v) return { variantId: v.id, matchedSize: v.size };
  v = variants.find((vv) => vv.size === 'Unique'); if (v) return { variantId: v.id, matchedSize: v.size };
  if (variants.length === 1) return { variantId: variants[0].id, matchedSize: variants[0].size };
  return { variantId: null, matchedSize: null };
}

// ============================================================================
// API UPLOAD
// ============================================================================
async function loginAdmin(): Promise<string | null> {
  const email = process.env.ADMIN_EMAIL || 'admin@xguard.ca';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.warn('⚠ ADMIN_PASSWORD non défini → upload PDF désactivé');
    return null;
  }
  try {
    const res = await axios.post(`${API_URL}/api/auth/login`, { email, password }, { timeout: 30000 });
    return res.data?.accessToken || res.data?.token || res.data?.data?.accessToken || res.data?.data?.token;
  } catch (e: any) {
    console.warn(`⚠ Login échoué: ${e.message}`);
    return null;
  }
}

async function uploadPdfApi(token: string, issuanceId: string, pdfPath: string): Promise<boolean> {
  try {
    const fd = new FormData();
    fd.append('pdf', fs.createReadStream(pdfPath), { filename: path.basename(pdfPath), contentType: 'application/pdf' });
    await axios.post(`${API_URL}/api/uniforms/issuances/${issuanceId}/upload-pdf`, fd, {
      headers: { ...fd.getHeaders(), Authorization: `Bearer ${token}` },
      maxBodyLength: 20 * 1024 * 1024,
      maxContentLength: 20 * 1024 * 1024,
      timeout: 60000,
    });
    return true;
  } catch (e: any) {
    console.log(`✗ Upload échoué: ${e.message}`);
    return false;
  }
}

// ============================================================================
// MAIN
// ============================================================================
interface Report {
  totalPdfs: number;
  skippedNonActif: { file: string; emp: string; status: string }[];
  employeeNotFound: { file: string }[];
  createdIssuances: { file: string; emp: string; issuanceId: string }[];
  pdfsUploaded: { file: string; emp: string }[];
  pdfsAlreadyAttached: { file: string; emp: string }[];
  itemsCorrect: { file: string; emp: string }[];
  itemsFixed: { file: string; emp: string; oldTotal: number; newTotal: number }[];
  needsManualReview: { file: string; emp: string; reason: string }[];
}

async function main() {
  await loadEmployees();
  const token = await loginAdmin();

  // Liste tous les PDFs
  const allPdfs: string[] = [];
  for (const folder of FOLDERS) {
    if (!fs.existsSync(folder)) continue;
    for (const f of fs.readdirSync(folder)) {
      if (f.toLowerCase().endsWith('.pdf')) allPdfs.push(path.join(folder, f));
    }
  }
  console.log(`\n📂 ${allPdfs.length} PDFs à analyser ${APPLY ? '(APPLY MODE)' : '(DRY-RUN)'}\n`);

  const report: Report = {
    totalPdfs: allPdfs.length,
    skippedNonActif: [],
    employeeNotFound: [],
    createdIssuances: [],
    pdfsUploaded: [],
    pdfsAlreadyAttached: [],
    itemsCorrect: [],
    itemsFixed: [],
    needsManualReview: [],
  };

  for (const pdfPath of allPdfs) {
    const base = path.basename(pdfPath);
    const dateM = base.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!dateM) {
      report.needsManualReview.push({ file: base, emp: '?', reason: 'date introuvable dans le nom' });
      continue;
    }
    const date = `${dateM[1]}-${dateM[2]}-${dateM[3]}`;
    const name = base.replace(/^\d{8}[\s-]*/, '').replace(/\.pdf$/i, '');

    const emp = findEmployee(name);
    if (!emp) {
      report.employeeNotFound.push({ file: base });
      continue;
    }
    if (emp.status !== 'ACTIF' && !INCLUDE_INACTIF) {
      report.skippedNonActif.push({ file: base, emp: `${emp.firstName} ${emp.lastName}`, status: emp.status });
      continue;
    }

    // Find or create issuance
    let issuance = await prisma.uniformIssuance.findFirst({
      where: {
        employeeId: emp.id,
        issuedAt: { gte: new Date(`${date}T00:00:00`), lt: new Date(`${date}T23:59:59`) },
      },
      include: { lines: { include: { variant: { include: { item: true } } } } },
    });

    // Parse PDF
    let parsed: Awaited<ReturnType<typeof parsePdfFile>>;
    try {
      parsed = await parsePdfFile(pdfPath);
    } catch (e) {
      report.needsManualReview.push({ file: base, emp: `${emp.firstName} ${emp.lastName}`, reason: `Parse error: ${(e as Error).message}` });
      continue;
    }

    if (!issuance) {
      // Create historical issuance
      if (APPLY) {
        const issuedAt = new Date(`${date}T12:00:00`);
        issuance = await prisma.uniformIssuance.create({
          data: {
            employeeId: emp.id,
            division: parsed.expectedDiv,
            status: 'ISSUED',
            issuedAt,
            totalLoanCost: 0,
            signatureStatus: 'SIGNED',
            signatureMethod: 'COUNTER',
            signedAt: issuedAt,
            payrollConsentAccepted: true,
            uniformPolicyConsentAccepted: parsed.expectedDiv === 'SECURITE',
            fitAttested: true,
            notes: `Import historique automatique (verify-all-historical-pdfs).`,
          },
          include: { lines: { include: { variant: { include: { item: true } } } } },
        });
        report.createdIssuances.push({ file: base, emp: `${emp.firstName} ${emp.lastName}`, issuanceId: issuance.id });
      } else {
        report.createdIssuances.push({ file: base, emp: `${emp.firstName} ${emp.lastName}`, issuanceId: '(à créer)' });
        continue; // En dry-run, on ne peut pas continuer sans issuance
      }
    }

    // Upload PDF si pas attaché
    if (!issuance.formPdfStoragePath) {
      if (APPLY && token) {
        const ok = await uploadPdfApi(token, issuance.id, pdfPath);
        if (ok) report.pdfsUploaded.push({ file: base, emp: `${emp.firstName} ${emp.lastName}` });
      } else {
        report.pdfsUploaded.push({ file: base, emp: `${emp.firstName} ${emp.lastName}` });
      }
    } else {
      report.pdfsAlreadyAttached.push({ file: base, emp: `${emp.firstName} ${emp.lastName}` });
    }

    // Compare items
    if (!parsed.match) {
      report.needsManualReview.push({
        file: base,
        emp: `${emp.firstName} ${emp.lastName}`,
        reason: `Total parser ${parsed.computedTotal.toFixed(2)} != total PDF ${parsed.totalLoanCost.toFixed(2)}`,
      });
      continue;
    }

    // Build expected lines (with variant resolution)
    const expectedLineData: { variantId: string | null; customItemName: string | null; quantity: number; unitCostSnapshot: number; sig: string }[] = [];
    for (const l of parsed.lines) {
      const { variantId, matchedSize } = await resolveVariantSize(l.itemName, l.size, l.rawSizeToken);
      const effectiveSize = matchedSize || l.size || l.rawSizeToken || '';
      expectedLineData.push({
        variantId,
        customItemName: variantId ? null : `${l.itemName}${l.rawSizeToken ? ' [' + l.rawSizeToken + ']' : ''}`,
        quantity: l.quantity,
        unitCostSnapshot: l.unitCost,
        sig: `${l.itemName}|${effectiveSize}|${l.quantity}`,
      });
    }
    const expectedSigs = new Set(expectedLineData.map((l) => l.sig));

    // Current DB lines
    const dbSigs = new Set(issuance.lines.map(dbLineSignature));
    const sigsMatch = expectedSigs.size === dbSigs.size && [...expectedSigs].every((s) => dbSigs.has(s));

    if (sigsMatch) {
      report.itemsCorrect.push({ file: base, emp: `${emp.firstName} ${emp.lastName}` });
    } else {
      const oldTotal = Number(issuance.totalLoanCost);
      const newTotal = expectedLineData.reduce((s, l) => s + l.quantity * l.unitCostSnapshot, 0);
      if (APPLY) {
        await prisma.$transaction(async (tx) => {
          await tx.uniformIssuanceLine.deleteMany({ where: { issuanceId: issuance!.id } });
          await tx.uniformIssuanceLine.createMany({
            data: expectedLineData.map((l) => ({
              issuanceId: issuance!.id,
              variantId: l.variantId,
              customItemName: l.customItemName,
              quantity: l.quantity,
              unitCostSnapshot: l.unitCostSnapshot,
            })),
          });
          await tx.uniformIssuance.update({
            where: { id: issuance!.id },
            data: { totalLoanCost: newTotal, division: parsed.expectedDiv },
          });
        });
      }
      report.itemsFixed.push({ file: base, emp: `${emp.firstName} ${emp.lastName}`, oldTotal, newTotal });
    }
  }

  // ===== RAPPORT FINAL =====
  console.log('\n' + '='.repeat(70));
  console.log(`RAPPORT FINAL — ${report.totalPdfs} PDFs`);
  console.log('='.repeat(70));

  console.log(`\n✓ Items corrects en BD                : ${report.itemsCorrect.length}`);
  console.log(`✏ Items à corriger / corrigés         : ${report.itemsFixed.length}`);
  console.log(`📁 PDFs déjà attachés en BD            : ${report.pdfsAlreadyAttached.length}`);
  console.log(`📤 PDFs uploadés / à uploader          : ${report.pdfsUploaded.length}`);
  console.log(`➕ Nouvelles remises créées / à créer   : ${report.createdIssuances.length}`);
  console.log(`⊘ Skippés (employé non-ACTIF)          : ${report.skippedNonActif.length}`);
  console.log(`⚠ Employé introuvable                  : ${report.employeeNotFound.length}`);
  console.log(`🔍 À revoir manuellement                : ${report.needsManualReview.length}`);

  if (report.skippedNonActif.length) {
    console.log(`\n--- Skippés non-ACTIF (${report.skippedNonActif.length}) ---`);
    for (const r of report.skippedNonActif) console.log(`  • ${r.file} → ${r.emp} (${r.status})`);
  }
  if (report.employeeNotFound.length) {
    console.log(`\n--- Employé introuvable (${report.employeeNotFound.length}) ---`);
    for (const r of report.employeeNotFound) console.log(`  • ${r.file}`);
  }
  if (report.createdIssuances.length) {
    console.log(`\n--- Remises créées (${report.createdIssuances.length}) ---`);
    for (const r of report.createdIssuances) console.log(`  • ${r.emp} | ${r.file} | ${r.issuanceId}`);
  }
  if (report.itemsFixed.length) {
    console.log(`\n--- Items corrigés (${report.itemsFixed.length}) ---`);
    for (const r of report.itemsFixed) console.log(`  • ${r.emp} | ${r.file} | $${r.oldTotal.toFixed(2)} → $${r.newTotal.toFixed(2)}`);
  }
  if (report.pdfsUploaded.length) {
    console.log(`\n--- PDFs uploadés (${report.pdfsUploaded.length}) ---`);
    for (const r of report.pdfsUploaded) console.log(`  • ${r.emp} | ${r.file}`);
  }
  if (report.needsManualReview.length) {
    console.log(`\n--- À revoir manuellement (${report.needsManualReview.length}) ---`);
    for (const r of report.needsManualReview) console.log(`  • ${r.emp} | ${r.file} | ${r.reason}`);
  }

  console.log('\n' + (APPLY ? '✓ Changements appliqués en BD.' : '🔍 DRY-RUN — relance avec --apply pour appliquer.') + '\n');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
