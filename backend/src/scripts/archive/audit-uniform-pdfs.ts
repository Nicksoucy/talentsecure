/**
 * Audit READ-ONLY de l'état des 84 PDFs historiques d'uniforme.
 *
 * Pour chaque PDF dans :
 *   - C:\Users\nicol\Downloads\OneDrive_1_26-05-2026
 *   - C:\Users\nicol\Downloads\OneDrive_2_26-05-2026
 *
 * Le script vérifie :
 *   1) Le PDF (nom = "YYYYMMDD[ -]Prénom Nom.pdf") matche un employé en DB (incluant INACTIF) ?
 *   2) Un UniformIssuance existe pour cet (employeeId, date) ?
 *   3) issuance.formPdfStoragePath est-il set ? (proxy R2)
 *   4) Combien de UniformIssuanceLine (items) sont rattachées ?
 *   5) totalLoanCost > 0 ?
 *
 * Sortie :
 *   - audit-uniform-pdfs.csv : tableau détaillé (1 ligne / PDF)
 *   - audit-uniform-pdfs-summary.json : compteurs
 *   - console : rapport synthétique
 *
 * AUCUN write en DB ni R2. Safe à exécuter sur production.
 *
 * Usage :
 *   npx ts-node src/scripts/audit-uniform-pdfs.ts
 *
 * L'environnement (local vs prod) est déterminé par DATABASE_URL dans .env.
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PDF_DIRS = [
  'C:\\Users\\nicol\\Downloads\\OneDrive_1_26-05-2026',
  'C:\\Users\\nicol\\Downloads\\OneDrive_2_26-05-2026',
];

// ---------- Normalisation noms (même logique que verify-all-historical-pdfs.ts) ----------
function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface EmployeeRec {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
}

function findEmployee(allEmployees: EmployeeRec[], name: string): EmployeeRec | null {
  const tokens = normName(name).split(' ').filter((t) => t.length >= 2);
  if (tokens.length < 2) return null;

  // Match parfait sur tous tokens (priorité ACTIF)
  const matchesAll: EmployeeRec[] = [];
  for (const e of allEmployees) {
    const full = normName(`${e.firstName} ${e.lastName}`);
    if (tokens.every((t) => full.includes(t))) matchesAll.push(e);
  }
  if (matchesAll.length > 0) {
    const actif = matchesAll.find((e) => e.status === 'ACTIF');
    return actif || matchesAll[0];
  }

  // Fallback : score (>= n-1 tokens)
  let best: { score: number; emp: EmployeeRec } | null = null;
  for (const e of allEmployees) {
    const full = normName(`${e.firstName} ${e.lastName}`);
    let score = 0;
    for (const t of tokens) if (full.includes(t)) score++;
    if (score >= Math.max(2, tokens.length - 1) && (!best || score > best.score)) {
      best = { score, emp: e };
    }
  }
  return best?.emp ?? null;
}

interface PdfAuditRow {
  pdfFilename: string;
  pdfDateIso: string | null;
  pdfNameRaw: string;
  employeeMatched: string; // "Prénom Nom" ou ""
  employeeStatus: string; // ACTIF / INACTIF / NOT_FOUND
  employeeId: string;
  issuanceId: string;
  issuanceTotal: string;
  linesCount: number;
  linesSig: string; // "ItemA|M|2 ; ItemB|L|1"
  pdfAttachedInR2: 'YES' | 'NO' | '-';
  formPdfStoragePath: string;
  gap: string; // description du problème
}

function dateFromFilename(filename: string): { iso: string | null; namePart: string } {
  const m = filename.match(/^(\d{4})(\d{2})(\d{2})[\s-]*/);
  if (!m) return { iso: null, namePart: filename.replace(/\.pdf$/i, '') };
  return {
    iso: `${m[1]}-${m[2]}-${m[3]}`,
    namePart: filename.slice(m[0].length).replace(/\.pdf$/i, ''),
  };
}

async function main() {
  const dbUrl = process.env.DATABASE_URL || '';
  const dbHost = dbUrl.match(/@([^/:]+)/)?.[1] || '(inconnu)';
  console.log(`\n📊 AUDIT — état DB pour les 84 PDFs historiques`);
  console.log(`   DB host : ${dbHost}`);
  console.log(`   (read-only : aucune écriture)\n`);

  // 1) Liste les PDFs source
  const pdfFiles: { folder: string; filename: string }[] = [];
  for (const dir of PDF_DIRS) {
    if (!fs.existsSync(dir)) {
      console.warn(`  ⚠ Dossier introuvable : ${dir}`);
      continue;
    }
    for (const f of fs.readdirSync(dir)) {
      if (f.toLowerCase().endsWith('.pdf')) pdfFiles.push({ folder: dir, filename: f });
    }
  }
  console.log(`  📂 ${pdfFiles.length} PDFs trouvés dans les dossiers OneDrive`);

  // 2) Charge TOUS les employés (ACTIF + INACTIF + autres)
  const allEmployees = (await prisma.employee.findMany({
    select: { id: true, firstName: true, lastName: true, status: true },
  })) as EmployeeRec[];
  console.log(`  👥 ${allEmployees.length} employés chargés (tous statuts)\n`);

  // 3) Pour chaque PDF, croise avec employee + issuance
  const rows: PdfAuditRow[] = [];

  for (const { filename } of pdfFiles) {
    const { iso, namePart } = dateFromFilename(filename);
    const row: PdfAuditRow = {
      pdfFilename: filename,
      pdfDateIso: iso,
      pdfNameRaw: namePart,
      employeeMatched: '',
      employeeStatus: 'NOT_FOUND',
      employeeId: '',
      issuanceId: '',
      issuanceTotal: '',
      linesCount: 0,
      linesSig: '',
      pdfAttachedInR2: '-',
      formPdfStoragePath: '',
      gap: '',
    };

    if (!iso) {
      row.gap = 'DATE_INVALID';
      rows.push(row);
      continue;
    }

    const emp = findEmployee(allEmployees, namePart);
    if (!emp) {
      row.gap = 'EMPLOYEE_NOT_FOUND';
      rows.push(row);
      continue;
    }
    row.employeeMatched = `${emp.firstName} ${emp.lastName}`;
    row.employeeStatus = emp.status;
    row.employeeId = emp.id;

    const issuance = await prisma.uniformIssuance.findFirst({
      where: {
        employeeId: emp.id,
        issuedAt: {
          gte: new Date(`${iso}T00:00:00`),
          lt: new Date(`${iso}T23:59:59`),
        },
      },
      include: { lines: { include: { variant: { include: { item: true } } } } },
    });

    if (!issuance) {
      row.gap = 'ISSUANCE_MISSING';
      rows.push(row);
      continue;
    }

    row.issuanceId = issuance.id;
    row.issuanceTotal = Number(issuance.totalLoanCost).toFixed(2);
    row.linesCount = issuance.lines.length;
    row.linesSig = issuance.lines
      .map((l) => {
        const name = l.variant?.item?.name || l.customItemName || '?';
        const size = l.variant?.size || '';
        return `${name}|${size}|${l.quantity}`;
      })
      .join(' ; ');

    row.formPdfStoragePath = issuance.formPdfStoragePath || '';
    row.pdfAttachedInR2 = issuance.formPdfStoragePath ? 'YES' : 'NO';

    const gaps: string[] = [];
    if (!issuance.formPdfStoragePath) gaps.push('PDF_NOT_ATTACHED');
    if (issuance.lines.length === 0) gaps.push('NO_LINES');
    if (Number(issuance.totalLoanCost) === 0) gaps.push('TOTAL_ZERO');
    row.gap = gaps.join(',');

    rows.push(row);
  }

  // 4) Sortie CSV
  const outDir = __dirname;
  const csvPath = path.join(outDir, 'audit-uniform-pdfs.csv');
  const headers = [
    'pdfFilename',
    'pdfDateIso',
    'pdfNameRaw',
    'employeeMatched',
    'employeeStatus',
    'employeeId',
    'issuanceId',
    'issuanceTotal',
    'linesCount',
    'pdfAttachedInR2',
    'formPdfStoragePath',
    'gap',
    'linesSig',
  ];
  const csvEscape = (v: string | number) => {
    const s = String(v ?? '');
    if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csvLines = [headers.join(';')];
  for (const r of rows) {
    csvLines.push(
      [
        r.pdfFilename,
        r.pdfDateIso ?? '',
        r.pdfNameRaw,
        r.employeeMatched,
        r.employeeStatus,
        r.employeeId,
        r.issuanceId,
        r.issuanceTotal,
        r.linesCount,
        r.pdfAttachedInR2,
        r.formPdfStoragePath,
        r.gap,
        r.linesSig,
      ]
        .map(csvEscape)
        .join(';'),
    );
  }
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf-8');

  // 5) Compteurs
  const stats = {
    totalPdfs: rows.length,
    employeeFound: rows.filter((r) => r.employeeId).length,
    employeeNotFound: rows.filter((r) => !r.employeeId).length,
    employeeInactif: rows.filter((r) => r.employeeStatus === 'INACTIF').length,
    employeeActif: rows.filter((r) => r.employeeStatus === 'ACTIF').length,
    issuancePresent: rows.filter((r) => r.issuanceId).length,
    issuanceMissing: rows.filter((r) => r.employeeId && !r.issuanceId).length,
    pdfAttached: rows.filter((r) => r.pdfAttachedInR2 === 'YES').length,
    pdfNotAttached: rows.filter((r) => r.pdfAttachedInR2 === 'NO').length,
    hasLines: rows.filter((r) => r.linesCount > 0).length,
    zeroLines: rows.filter((r) => r.issuanceId && r.linesCount === 0).length,
    totalZero: rows.filter((r) => r.issuanceTotal === '0.00').length,
    fullyOk: rows.filter((r) => r.issuanceId && r.pdfAttachedInR2 === 'YES' && r.linesCount > 0 && Number(r.issuanceTotal) > 0).length,
  };

  const summaryPath = path.join(outDir, 'audit-uniform-pdfs-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({ dbHost, stats, generatedAt: new Date().toISOString() }, null, 2));

  // 6) Console report
  console.log(`====================================================================`);
  console.log(`RAPPORT D'AUDIT — ${stats.totalPdfs} PDFs / DB ${dbHost}`);
  console.log(`====================================================================\n`);
  console.log(`✓ Fully OK (issuance + PDF en R2 + lines + total)    : ${stats.fullyOk}`);
  console.log(`📄 Issuance présent en DB                             : ${stats.issuancePresent}`);
  console.log(`📁 PDF attaché en R2 (formPdfStoragePath set)         : ${stats.pdfAttached}`);
  console.log(`📋 Lignes (items) présentes                           : ${stats.hasLines}`);
  console.log(``);
  console.log(`⚠ Employé introuvable (NOT_FOUND)                    : ${stats.employeeNotFound}`);
  console.log(`⊘ Employé INACTIF                                     : ${stats.employeeInactif}`);
  console.log(`✗ Issuance manquant en DB (employé OK, issuance NON)  : ${stats.issuanceMissing}`);
  console.log(`✗ PDF non attaché en R2 (issuance OK, PDF NON)        : ${stats.pdfNotAttached}`);
  console.log(`✗ Issuance avec 0 lignes (items manquants)            : ${stats.zeroLines}`);
  console.log(`✗ Total = 0$                                          : ${stats.totalZero}`);

  // Détail des cas problématiques
  const problems = rows.filter((r) => r.gap && r.gap !== '');
  if (problems.length > 0) {
    console.log(`\n--- Cas avec gap (${problems.length}) ---`);
    for (const r of problems) {
      console.log(
        `  • ${r.pdfFilename}  →  ${r.employeeMatched || '???'} [${r.employeeStatus}]  →  gap: ${r.gap}`,
      );
    }
  }

  console.log(`\n📄 CSV détaillé    : ${csvPath}`);
  console.log(`📄 Résumé JSON     : ${summaryPath}\n`);
}

main()
  .catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
