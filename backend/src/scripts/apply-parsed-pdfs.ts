/**
 * Applique les lignes parsées (parsed-pdfs.json) aux remises historiques
 * existantes en DB. N'écrase que les remises dont le total parser matche le total PDF.
 *
 * Optionnel : avec R2 configuré, attache aussi le PDF original.
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Toggle pour upload R2 (skip si pas de credentials)
let uploadBufferToR2: any = null;
try {
  if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID) {
    uploadBufferToR2 = require('../services/r2.service').uploadBufferToR2;
  }
} catch {}

interface ParsedLine {
  itemName: string;
  division: 'SECURITE' | 'SIGNALISATION';
  type: 'UNIFORME' | 'EQUIPEMENT';
  size: string | null;
  rawSizeToken: string | null;
  quantity: number;
  unitCost: number;
  total: number;
}

interface PdfReport {
  file: string;
  division: 'SECURITE' | 'SIGNALISATION' | 'BOTH' | 'UNKNOWN';
  totalLoanCost: number;
  computedTotal: number;
  match: boolean;
  lines: ParsedLine[];
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function dateFromFile(filePath: string): string | null {
  const base = path.basename(filePath);
  const m = base.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function nameFromFile(filePath: string): string {
  return path.basename(filePath).replace(/^\d{8}[\s-]*/, '').replace(/\.pdf$/i, '');
}

// Trouve la variante (variantId) pour un (itemName, size).
async function resolveVariant(itemName: string, size: string | null, rawSize: string | null): Promise<{ variantId: string | null; matchedSize: string | null; warning?: string }> {
  const item = await prisma.uniformItem.findFirst({
    where: { name: itemName },
    include: { variants: { where: { isActive: true } } },
  });
  if (!item) return { variantId: null, matchedSize: null, warning: `Item « ${itemName} » introuvable en DB` };

  const variants = item.variants;
  const trySize = (s: string | null) => {
    if (!s) return null;
    return variants.find((v) => v.size.toUpperCase() === s.toUpperCase());
  };

  // 1) Match exact (taille standard)
  let v = trySize(size);
  if (v) return { variantId: v.id, matchedSize: v.size };

  // 2) Match exact sur rawSize (ex: "L" pour pantalon)
  v = trySize(rawSize);
  if (v) return { variantId: v.id, matchedSize: v.size };

  // 3) Fallback : taille Unique
  v = variants.find((vv) => vv.size === 'Unique');
  if (v) return { variantId: v.id, matchedSize: v.size };

  // 4) Si une seule variante existe : la prendre
  if (variants.length === 1) return { variantId: variants[0].id, matchedSize: variants[0].size };

  // 5) Aucune variante n'est claire — ne pas définir variantId
  const sizeMsg = rawSize || size || '(aucune)';
  return { variantId: null, matchedSize: null, warning: `Pas de variante pour « ${itemName} » taille « ${sizeMsg} »` };
}

async function findEmployee(name: string): Promise<{ id: string; firstName: string; lastName: string } | null> {
  const norm = normalize(name);
  const tokens = norm.split(' ').filter((t) => t.length >= 2);
  const all = await prisma.employee.findMany({
    where: { status: 'ACTIF' },
    select: { id: true, firstName: true, lastName: true },
  });
  for (const e of all) {
    const full = normalize(`${e.firstName} ${e.lastName}`);
    if (tokens.every((t) => full.includes(t))) return e;
  }
  return null;
}

async function main() {
  const jsonPath = path.join(__dirname, 'parsed-pdfs.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('Fichier parsed-pdfs.json introuvable. Lance d\'abord parse-historical-pdfs.ts.');
    process.exit(1);
  }
  const reports: PdfReport[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force'); // applique aussi les non-match

  console.log(`\n${dryRun ? '🔍 DRY RUN — ' : ''}Application de ${reports.length} rapports${force ? ' (force on non-match)' : ''}\n`);

  const stats = { applied: 0, skipped: 0, errors: 0, pdfsUploaded: 0 };
  const skipped: { file: string; reason: string }[] = [];
  const warnings: { file: string; warning: string }[] = [];

  for (const r of reports) {
    const base = path.basename(r.file);
    const date = dateFromFile(r.file);
    const name = nameFromFile(r.file);
    if (!date) { skipped.push({ file: base, reason: 'date non extraite' }); stats.skipped++; continue; }

    if (!r.match && !force) {
      skipped.push({ file: base, reason: `total ${r.totalLoanCost} ≠ calc ${r.computedTotal}` });
      stats.skipped++;
      continue;
    }

    const emp = await findEmployee(name);
    if (!emp) {
      skipped.push({ file: base, reason: 'employé ACTIF introuvable' });
      stats.skipped++;
      continue;
    }

    // Trouve la remise existante (créée par import-manual-historical-pdfs.ts)
    const issuance = await prisma.uniformIssuance.findFirst({
      where: {
        employeeId: emp.id,
        issuedAt: { gte: new Date(`${date}T00:00:00`), lt: new Date(`${date}T23:59:59`) },
      },
    });
    if (!issuance) {
      skipped.push({ file: base, reason: 'remise historique introuvable en DB (lance d\'abord import-manual-historical-pdfs.ts)' });
      stats.skipped++;
      continue;
    }

    // Build les lignes
    const lineData: { variantId: string | null; customItemName: string | null; quantity: number; unitCostSnapshot: number }[] = [];
    for (const l of r.lines) {
      const { variantId, warning } = await resolveVariant(l.itemName, l.size, l.rawSizeToken);
      if (warning) warnings.push({ file: base, warning });
      lineData.push({
        variantId,
        customItemName: variantId ? null : `${l.itemName}${l.rawSizeToken ? ' [' + l.rawSizeToken + ']' : ''}`,
        quantity: l.quantity,
        unitCostSnapshot: l.unitCost,
      });
    }
    const total = lineData.reduce((s, l) => s + l.quantity * l.unitCostSnapshot, 0);

    if (!dryRun) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.uniformIssuanceLine.deleteMany({ where: { issuanceId: issuance.id } });
          await tx.uniformIssuanceLine.createMany({ data: lineData.map((l) => ({ ...l, issuanceId: issuance.id })) });
          await tx.uniformIssuance.update({
            where: { id: issuance.id },
            data: { totalLoanCost: total, division: r.division === 'SIGNALISATION' ? 'SIGNALISATION' : 'SECURITE' },
          });
        });

        // Optionnel : upload PDF
        if (uploadBufferToR2 && fs.existsSync(r.file)) {
          const buf = fs.readFileSync(r.file);
          const { key } = await uploadBufferToR2(buf, `forms/issuances/${issuance.id}.pdf`, 'application/pdf');
          await prisma.uniformIssuance.update({ where: { id: issuance.id }, data: { formPdfStoragePath: key } });
          stats.pdfsUploaded++;
        }
        stats.applied++;
      } catch (e) {
        console.error(`✗ ${base}: ${(e as Error).message}`);
        stats.errors++;
      }
    } else {
      stats.applied++;
    }
    console.log(`${dryRun ? '🔍' : '✓'} ${emp.firstName} ${emp.lastName} | ${base} | ${lineData.length} lignes | total $${total.toFixed(2)}`);
  }

  console.log(`\n=== STATS ===`);
  console.log(`Appliqués : ${stats.applied}`);
  console.log(`Skippés   : ${stats.skipped}`);
  console.log(`Erreurs   : ${stats.errors}`);
  console.log(`PDFs upload R2 : ${stats.pdfsUploaded}${uploadBufferToR2 ? '' : ' (R2 non configuré)'}`);

  if (skipped.length) {
    console.log(`\n--- À revoir manuellement (${skipped.length}) ---`);
    for (const s of skipped) console.log(`  • ${s.file} : ${s.reason}`);
  }
  if (warnings.length) {
    console.log(`\n--- Warnings ${warnings.length} ---`);
    for (const w of warnings) console.log(`  • ${w.file} : ${w.warning}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
