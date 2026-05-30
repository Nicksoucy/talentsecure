/**
 * Crée 23 remises historiques VIDES (sans lignes).
 * - Aucun impact stock.
 * - status=ISSUED, signature=SIGNED/COUNTER (preuve papier).
 * - L'utilisateur :
 *     1) téléverse le PDF via "Téléverser PDF" dans la fiche employé.
 *     2) remplit les pièces via "Modifier les pièces" (à venir UI ou via PUT API).
 *
 * Le script imprime à la fin la table de mapping
 * (employé → chemin du PDF local) pour faciliter les uploads.
 *
 * Source : C:\Users\nicol\Downloads\OneDrive_1_26-05-2026 + OneDrive_2_26-05-2026.
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PDF_DIRS = [
  'C:\\Users\\nicol\\Downloads\\OneDrive_1_26-05-2026',
  'C:\\Users\\nicol\\Downloads\\OneDrive_2_26-05-2026',
];

// Liste fournie par l'utilisateur (23 remises à importer).
const TARGETS: { date: string; name: string }[] = [
  { date: '2025-11-03', name: 'Mamadou Ramadane Barry' },
  { date: '2026-02-13', name: 'Ceres dorcely' },
  { date: '2026-02-13', name: 'gilles coté' },
  { date: '2026-02-13', name: 'Lansana Guirassy' },
  { date: '2026-02-16', name: 'Calixte ludger' },
  { date: '2026-03-05', name: 'Salah Eddine' },
  { date: '2026-03-06', name: 'Papa Massamba Sock' },
  { date: '2026-04-27', name: 'Crisleidy Charlis' },
  { date: '2026-04-27', name: 'Joel Lepage' },
  { date: '2026-04-27', name: 'Mamadou Balde' },
  { date: '2026-04-27', name: 'Mohamed Diakité' },
  { date: '2026-04-28', name: 'Raafat Al Jrab' },
  { date: '2026-05-01', name: 'Ian Gibilaro' },
  { date: '2026-05-01', name: 'Rene Descharte Ngoulour' },
  { date: '2026-05-06', name: 'Patrick Cesars' },
  { date: '2026-05-07', name: 'Emmanuel Nanguep Chetcho' },
  { date: '2026-05-22', name: 'Anthony Jn Roland Jacques' },
  { date: '2026-05-22', name: 'Boualem Dahmouni' },
  { date: '2026-05-22', name: 'Colette Flora Ngo Bilong' },
  { date: '2026-05-22', name: 'fouad Moubacher' },
  { date: '2026-05-22', name: 'Fritzger Ismenard' },
  { date: '2026-05-22', name: 'Mohamed Lamine Sylla' },
  { date: '2026-05-22', name: 'Omar Nadir' },
];

// Normalise pour comparaison (enlève accents, espaces multiples, minuscules).
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dateToPdfPrefix(date: string): string {
  // "2026-02-13" -> "20260213"
  return date.replace(/-/g, '');
}

// Trouve le PDF qui correspond le mieux au (date, name).
function findPdfFile(date: string, name: string): string | null {
  const prefix = dateToPdfPrefix(date);
  const normName = normalize(name);
  for (const dir of PDF_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.pdf')) continue;
      if (!f.startsWith(prefix)) continue;
      // Extrait le nom (après le préfixe date + séparateur optionnel)
      const after = f.replace(/^\d{8}[\s-]*/, '').replace(/\.pdf$/i, '');
      const normFile = normalize(after);
      if (normFile === normName) return path.join(dir, f);
      // Tolère un sous-ensemble (ex: "Anthony Jn Roland Jacques" vs "Anthony Roland Jacques")
      const tokens = normName.split(' ').filter((t) => t.length > 2);
      if (tokens.every((t) => normFile.includes(t))) return path.join(dir, f);
    }
  }
  return null;
}

// Trouve l'employé ACTIF qui correspond le mieux.
async function findEmployee(name: string) {
  const normName = normalize(name);
  const tokens = normName.split(' ').filter((t) => t.length >= 2);
  if (tokens.length < 2) return null;

  // Cherche tout employé actif puis matche par tokens.
  const all = await prisma.employee.findMany({
    where: { status: 'ACTIF' },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });
  let best: { score: number; emp: any } | null = null;
  for (const e of all) {
    const full = normalize(`${e.firstName} ${e.lastName}`);
    let score = 0;
    for (const t of tokens) {
      if (full.includes(t)) score++;
    }
    if (score === tokens.length) return e; // match parfait sur tous les tokens
    if (score >= Math.max(2, tokens.length - 1) && (!best || score > best.score)) {
      best = { score, emp: e };
    }
  }
  return best?.emp ?? null;
}

async function main() {
  const results: { name: string; date: string; status: 'OK' | 'NO_EMPLOYEE' | 'NO_PDF' | 'DUPLICATE'; detail?: string }[] = [];

  for (const { date, name } of TARGETS) {
    const pdfPath = findPdfFile(date, name);
    if (!pdfPath) {
      results.push({ name, date, status: 'NO_PDF' });
      continue;
    }
    const emp = await findEmployee(name);
    if (!emp) {
      results.push({ name, date, status: 'NO_EMPLOYEE', detail: `PDF trouvé: ${path.basename(pdfPath)}` });
      continue;
    }

    // Vérifie qu'on ne crée pas un doublon (même employé, même date)
    const issuedAt = new Date(`${date}T12:00:00`);
    const existing = await prisma.uniformIssuance.findFirst({
      where: {
        employeeId: emp.id,
        issuedAt: { gte: new Date(`${date}T00:00:00`), lt: new Date(`${date}T23:59:59`) },
      },
    });
    if (existing) {
      results.push({ name, date, status: 'DUPLICATE', detail: `Issuance ${existing.id} déjà présente` });
      continue;
    }

    // Crée la remise historique vide
    const issuance = await prisma.uniformIssuance.create({
      data: {
        employeeId: emp.id,
        division: 'SECURITE', // défaut, modifiable via UI
        status: 'ISSUED',
        issuedAt,
        totalLoanCost: 0,
        signatureStatus: 'SIGNED',
        signatureMethod: 'COUNTER',
        signedAt: issuedAt,
        payrollConsentAccepted: true,
        uniformPolicyConsentAccepted: true,
        fitAttested: true,
        notes: `Import historique (PDF papier) — pièces à compléter manuellement.`,
      },
    });

    results.push({
      name,
      date,
      status: 'OK',
      detail: `${emp.firstName} ${emp.lastName} (employeeId=${emp.id}) | issuance=${issuance.id} | pdf=${pdfPath}`,
    });
  }

  // Rapport
  console.log('\n========== RAPPORT D\'IMPORT ==========\n');
  const ok = results.filter((r) => r.status === 'OK');
  const noEmp = results.filter((r) => r.status === 'NO_EMPLOYEE');
  const noPdf = results.filter((r) => r.status === 'NO_PDF');
  const dup = results.filter((r) => r.status === 'DUPLICATE');

  console.log(`✓ ${ok.length}/${TARGETS.length} importés`);
  for (const r of ok) console.log(`  • ${r.date} ${r.name.padEnd(35)} → ${r.detail}`);

  if (dup.length) {
    console.log(`\n⊘ ${dup.length} doublons (déjà importés) :`);
    for (const r of dup) console.log(`  • ${r.date} ${r.name} (${r.detail})`);
  }

  if (noEmp.length) {
    console.log(`\n⚠ ${noEmp.length} employé ACTIF introuvable :`);
    for (const r of noEmp) console.log(`  • ${r.date} ${r.name} (${r.detail})`);
  }

  if (noPdf.length) {
    console.log(`\n⚠ ${noPdf.length} PDF introuvable :`);
    for (const r of noPdf) console.log(`  • ${r.date} ${r.name}`);
  }
  console.log('');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
