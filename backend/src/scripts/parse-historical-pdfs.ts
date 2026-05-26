/**
 * Parse les PDFs historiques de prêt d'uniforme et extrait :
 *   - division (SECURITE / SIGNALISATION)
 *   - lignes (item, taille, qté, coût unit, total)
 *   - coût total du prêt
 *
 * Robuste aux erreurs OCR fréquentes :
 *   - 'o,oo' → '0,00', '0o' → '00', '4o' → '40'
 *   - 'Chenll'se' → 'Chemise', 'Pantaton' → 'Pantalon', 'mititaire' → 'militaire'
 *   - 'Taitte' → 'Taille', 'Totat' → 'Total', etc.
 *
 * Usage :
 *   ts-node parse-historical-pdfs.ts <pdf-path>     # 1 fichier
 *   ts-node parse-historical-pdfs.ts <directory>    # tous les *.pdf du dossier
 *
 * Sortie : JSON sur stdout (en plus du tableau lisible).
 */
import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import { SEED_CATALOGUE, type UniformDivisionKey } from '../constants/uniform';

// ------- Normalisation OCR ----------
function fixOcr(s: string): string {
  return s
    // Caractères courants OCR
    .replace(/Taitte|Tailtte|Taittë|Taitt[eê]/gi, 'Taille')
    .replace(/Totat/gi, 'Total')
    .replace(/Pantaton/gi, 'Pantalon')
    .replace(/mititaire/gi, 'militaire')
    .replace(/Chenll'se|Chenll['']se|Chenll['"]se|Chenli['"]se|Chenllse/gi, 'Chemise')
    .replace(/btanche|bl\.anche|bl,anche/gi, 'blanche')
    .replace(/comptet|compLet|compl,et/gi, 'complet')
    .replace(/visibitité|visibitit[eé]|visibil,ité/gi, 'visibilité')
    .replace(/sécurrité|sécurrte|sécurrrté/gi, 'sécurité')
    .replace(/poto|po\[o/gi, 'polo')
    .replace(/Plqque|Plaqque/gi, 'Plaque')
    .replace(/ptuie/gi, 'pluie')
    .replace(/Chandait/gi, 'Chandail')
    .replace(/Casçue/gi, 'Casque')
    // 's' utilisé pour '$' devant un montant (très fréquent OCR).
    // Accepte aussi 's'/'o' à l'intérieur du nombre (ex: "s 2s,00" → "$ 25,00").
    .replace(/\bs\s+([0-9oOsS]+[,.][0-9oOsS]{2})/g, '$ $1')
    // 'S' (majuscule) aussi
    .replace(/\bS\s+([0-9oOsS]+[,.][0-9oOsS]{2})/g, '$ $1');
}

function normalize(s: string): string {
  return fixOcr(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Forme « compacte » : retire d'abord tous les non-alphanum, PUIS applique fixOcr/normalize.
 * Robuste aux dots/espaces inline OCR (`mil.itaire`, `m ititaire`). */
function compact(s: string): string {
  const stripped = s.replace(/[^a-zA-Z0-9]/g, '');
  return fixOcr(stripped)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Convertit "$ 4o,oo" / "$ 40,00" / "$ 6s,00" / "$ 0,00" → number
function parseMoney(token: string): number {
  // OCR: o↔0, s↔5 (à l'intérieur d'un nombre), garde virgule
  const cleaned = token
    .replace(/o/gi, '0')
    .replace(/s/gi, '5')
    .replace(/[^0-9,.]/g, '')
    .replace(',', '.');
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : NaN;
}

// Détecte "$ X,XX $ Y,YY" — accepte aussi 's' et 'o' comme caractères OCR.
const MONEY_PAIR_RE = /\$\s*([\dOoSs]+[,.][\dOoSs]{2})\s*\$\s*([\dOoSs]+[,.][\dOoSs]{2})/g;
const MONEY_RE = /\$\s*([\dOoSs]+[,.][\dOoSs]{2})/g;

// ------- Catalogue plat -----------
interface CatalogItem {
  division: UniformDivisionKey;
  name: string;
  normName: string;
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
    normName: normalize(it.name),
    compactName: compact(it.name),
    type: it.type,
    cost: it.cost,
    sizes: it.sizes,
    isOneSize: it.isOneSize,
  })),
);

// ------- Détection de la division (boîte cochée) -------
// Regex tolérante : OCR donne parfois "Coût:tota[ du prêt", "Caût total du prèt", etc.
// Le montant capturé accepte aussi 's' (OCR pour 5).
const TOTAL_RE = /co[uûaâü]t[^a-z0-9]{0,5}tota[lt\[\(][^a-z0-9]{1,5}du[^a-z0-9]{1,5}pr[eèêé]t[^a-z0-9]{0,15}\$?\s*([\dOoSs]+[,.][\dOoSs]{2})/gi;

function detectDivision(text: string): UniformDivisionKey | 'BOTH' | 'UNKNOWN' {
  const matches: number[] = [];
  const fixed = fixOcr(text);
  TOTAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOTAL_RE.exec(fixed)) !== null) {
    matches.push(parseMoney(m[1]));
  }
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

// ------- Parse d'une ligne de pièce -------
interface ParsedLine {
  itemName: string;
  division: UniformDivisionKey;
  type: 'UNIFORME' | 'EQUIPEMENT';
  size: string | null;
  /** Taille brute lue dans le PDF (peut ne pas correspondre à une variante existante). */
  rawSizeToken: string | null;
  quantity: number;
  unitCost: number;
  total: number;
  matched: boolean;
  rawLine?: string;
}

// Parse le texte du PDF et retourne toutes les lignes avec total > 0
function parsePdfText(text: string, expectedDivision: UniformDivisionKey): ParsedLine[] {
  const fixed = fixOcr(text);
  const lines = fixed.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const found: ParsedLine[] = [];

  // Suit la "section" courante du formulaire (SECURITE/SIGNALISATION) selon les
  // entêtes "DIVISION SÉCURITÉ" / "DIVISION SIGNALISATION" rencontrés.
  let currentSection: UniformDivisionKey = 'SECURITE';
  const seen = new Set<string>(); // (itemName) — anti-doublons

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const normLine = normalize(line);
    const cmpLine = compact(line);

    // Détection de la section depuis les entêtes
    if (cmpLine.includes('divisionsignalisation') || cmpLine.includes('signaisationdivision')) {
      currentSection = 'SIGNALISATION';
    } else if (cmpLine.includes('divisionsecurite') || cmpLine.includes('securitedivision')) {
      currentSection = 'SECURITE';
    }

    // Matching item : compact (insensible aux espaces/dots/accents OCR) ;
    // un item de la section opposée est ignoré.
    let matched: CatalogItem | null = null;
    let bestLen = 0;
    for (const item of CATALOG) {
      if (item.division !== currentSection) continue;
      if (cmpLine.startsWith(item.compactName) || cmpLine.includes(item.compactName)) {
        if (item.compactName.length > bestLen) {
          matched = item;
          bestLen = item.compactName.length;
        }
      }
    }
    if (!matched) continue;
    // Dédup
    if (seen.has(matched.name)) continue;
    // Restreint à la division attendue (sauf si BOTH)
    if (expectedDivision !== matched.division) {
      // Skip items du mauvais côté du formulaire — sauf si SIGNALISATION a items en SECURITE row
      // On garde quand même mais on note.
    }

    // Cherche tous les "$ X,XX $ Y,YY" puis tous les "$ X,XX" dans la ligne.
    MONEY_PAIR_RE.lastIndex = 0;
    const pairs: { unit: number; total: number }[] = [];
    let mp: RegExpExecArray | null;
    while ((mp = MONEY_PAIR_RE.exec(line)) !== null) {
      pairs.push({ unit: parseMoney(mp[1]), total: parseMoney(mp[2]) });
    }

    // Layout : (a, b) du premier $ pair. Détermine quel est unit/total
    // en comparant au coût catalogue connu.
    let unit: number;
    let total: number;
    if (pairs.length > 0) {
      const [a, b] = [pairs[0].unit, pairs[0].total];
      const aIsCost = Math.abs(a - matched.cost) < 0.01;
      const bIsCost = Math.abs(b - matched.cost) < 0.01;
      if (aIsCost && !bIsCost) {
        // Layout standard : (unit, total)
        unit = a; total = b;
      } else if (bIsCost && !aIsCost) {
        // Layout inversé : (total, unit)
        unit = b; total = a;
      } else {
        // Ambigu (les 2 == cost, ou aucun == cost) → standard par défaut
        unit = a; total = b;
      }
    } else {
      // Cas dégradé OCR : un seul montant détecté.
      MONEY_RE.lastIndex = 0;
      const singles: number[] = [];
      let ms: RegExpExecArray | null;
      while ((ms = MONEY_RE.exec(line)) !== null) singles.push(parseMoney(ms[1]));
      if (singles.length === 0) continue;
      // Si présence d'une quantité (digit isolé après le nom dans Layout A,
      // ou avant le nom dans Layout B), on considère la ligne remplie.
      const hasQtyDigit = /\b[1-9]\d?\b/.test(line.replace(/[\dOoSs]+[,.][\dOoSs]{2}/g, ''));
      if (singles[0] > matched.cost * 1.5) {
        // Probablement un total
        total = singles[0]; unit = matched.cost;
      } else if (Math.abs(singles[0] - matched.cost) < 0.01) {
        if (hasQtyDigit) {
          // Cost répété avec qty présente → qty * cost
          total = singles[0]; unit = matched.cost;
        } else {
          // Sinon ligne vide (juste le cost répété)
          continue;
        }
      } else {
        total = singles[0]; unit = matched.cost;
      }
    }
    if (!(total > 0)) continue; // Ligne vide, skip

    // Quantité : tente déduction par total / unit
    let quantity = Math.round(total / (unit || matched.cost));
    if (!isFinite(quantity) || quantity <= 0) quantity = 1;

    // Taille : on STRIP d'abord les montants ($ XX,XX) puis on cherche un token taille.
    const SIZE_LIKE = /^(XS|S|M|L|XL|2XL|3XL|4XL|5XL|ZXL|2[8-9]|3\d|4[0-4])$/i;
    let size: string | null = null;
    let rawSizeToken: string | null = null;
    if (matched.isOneSize) {
      size = 'Unique';
    } else if (matched.sizes) {
      const lineNoMoney = line.replace(/\$\s*[\dOo]+[,.][\dOo]{2}/g, ' ').replace(/[Ss]\s*[\dOo]+[,.][\dOo]{2}/g, ' ');
      const tokens = lineNoMoney.split(/[^a-zA-Z0-9]+/).filter(Boolean);
      // 1) Cherche d'abord une taille EXACTE dans matched.sizes
      for (const t of tokens) {
        if (matched.sizes.includes(t.toUpperCase())) {
          size = t.toUpperCase();
          break;
        }
      }
      // 2) Sinon, cherche n'importe quel token "taille-like" — gardé brut
      if (!size) {
        for (const t of tokens) {
          if (SIZE_LIKE.test(t)) {
            rawSizeToken = t.toUpperCase().replace(/^Z/, '2'); // OCR ZXL → 2XL
            break;
          }
        }
      }
    }

    found.push({
      itemName: matched.name,
      division: matched.division,
      type: matched.type,
      size,
      rawSizeToken,
      quantity,
      unitCost: unit || matched.cost,
      total,
      matched: true,
      rawLine: line,
    });
    seen.add(matched.name);
  }

  return found;
}

// ------- Extraction du texte d'un PDF -------
async function extractText(pdfPath: string): Promise<string> {
  const buf = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const result = await parser.getText();
  const pages = result.pages || [];
  return pages.map((p: any) => p.text || '').join('\n');
}

// ------- Traitement d'un PDF -------
interface PdfReport {
  file: string;
  division: UniformDivisionKey | 'BOTH' | 'UNKNOWN';
  totalLoanCost: number;
  computedTotal: number;
  match: boolean;
  lines: ParsedLine[];
}

async function processPdf(pdfPath: string): Promise<PdfReport> {
  const text = await extractText(pdfPath);
  let division: UniformDivisionKey | 'BOTH' | 'UNKNOWN' = detectDivision(text);

  // Premier essai : parse avec la division détectée (par défaut SECURITE).
  const lines = parsePdfText(text, division === 'SIGNALISATION' ? 'SIGNALISATION' : 'SECURITE');

  // Si division UNKNOWN : déduit à partir des items détectés.
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

  return {
    file: pdfPath,
    division,
    totalLoanCost,
    computedTotal,
    match: totalLoanCost > 0 && Math.abs(computedTotal - totalLoanCost) < 0.5,
    lines: filtered,
  };
}

// ------- Main -------
async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: ts-node parse-historical-pdfs.ts <pdf | directory | filelist.txt>');
    process.exit(1);
  }
  let pdfs: string[];
  if (arg.toLowerCase().endsWith('.txt')) {
    // Liste de noms de fichiers — préfixe avec OneDrive folders si chemin relatif
    const baseDirs = [
      'C:\\Users\\nicol\\Downloads\\OneDrive_1_26-05-2026',
      'C:\\Users\\nicol\\Downloads\\OneDrive_2_26-05-2026',
    ];
    const names = fs.readFileSync(arg, 'utf-8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    pdfs = [];
    for (const n of names) {
      // Si chemin absolu, prend tel quel
      if (path.isAbsolute(n) && fs.existsSync(n)) { pdfs.push(n); continue; }
      // Sinon, cherche dans baseDirs
      let found = false;
      for (const d of baseDirs) {
        const p = path.join(d, n);
        if (fs.existsSync(p)) { pdfs.push(p); found = true; break; }
      }
      if (!found) console.error(`  ⚠ PDF introuvable: ${n}`);
    }
  } else {
    const stat = fs.statSync(arg);
    pdfs = stat.isDirectory()
      ? fs.readdirSync(arg).filter((f) => f.toLowerCase().endsWith('.pdf')).map((f) => path.join(arg, f))
      : [arg];
  }

  const reports: PdfReport[] = [];
  for (const p of pdfs) {
    try {
      const r = await processPdf(p);
      reports.push(r);
    } catch (e) {
      console.error(`✗ ${path.basename(p)} : ${(e as Error).message}`);
    }
  }

  // Sortie lisible
  console.log('\n========== RAPPORT DE PARSING ==========\n');
  for (const r of reports) {
    const flag = r.match ? '✓' : '⚠';
    console.log(`${flag} ${path.basename(r.file)}  [${r.division}]  total=${r.totalLoanCost.toFixed(2)} calc=${r.computedTotal.toFixed(2)}`);
    for (const l of r.lines) {
      const sizeDisplay = l.size || (l.rawSizeToken ? `*${l.rawSizeToken}` : '—');
      console.log(`    • ${l.itemName.padEnd(40)} ${sizeDisplay.padEnd(8)} qty=${l.quantity}  unit=${l.unitCost.toFixed(2)}  total=${l.total.toFixed(2)}`);
    }
  }

  // Sauvegarde JSON
  const outPath = path.join(__dirname, 'parsed-pdfs.json');
  fs.writeFileSync(outPath, JSON.stringify(reports, null, 2));
  console.log(`\n📄 JSON sauvé : ${outPath}\n`);

  // Résumé
  const ok = reports.filter((r) => r.match).length;
  console.log(`Résumé : ${ok}/${reports.length} PDFs avec total qui matche le calcul.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
