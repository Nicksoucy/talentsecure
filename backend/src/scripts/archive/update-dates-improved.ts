import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXCEL_FILE_PATH = 'C:\\Recrutement\\Grille d\'entretiens xguard.security (1).xlsx';

// Helper function to convert Excel date
function excelDateToJSDate(excelDate: number): Date {
  const EXCEL_EPOCH = new Date(1899, 11, 30);
  return new Date(EXCEL_EPOCH.getTime() + excelDate * 24 * 60 * 60 * 1000);
}

// Helper function to parse interview date
function parseInterviewDate(dateValue: any): Date | null {
  if (!dateValue) return null;
  if (typeof dateValue === 'number') return excelDateToJSDate(dateValue);
  if (dateValue instanceof Date) return dateValue;
  if (typeof dateValue === 'string') {
    const parsed = new Date(dateValue);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

// Normalize text for comparison
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate similarity score
function similarity(s1: string, s2: string): number {
  const norm1 = normalize(s1);
  const norm2 = normalize(s2);

  if (norm1 === norm2) return 100;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 80;

  const words1 = norm1.split(' ');
  const words2 = norm2.split(' ');

  let matchCount = 0;
  for (const w1 of words1) {
    if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) {
      matchCount++;
    }
  }

  return (matchCount / Math.max(words1.length, words2.length)) * 70;
}

async function updateDates() {
  console.log('🚀 Mise à jour améliorée des dates...\n');

  try {
    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const summarySheet = workbook.Sheets['Récapitulatif xguard '];
    const summaryData = XLSX.utils.sheet_to_json(summarySheet) as any[];

    const allCandidates = await prisma.candidate.findMany({
      where: { isDeleted: false },
      select: { id: true, firstName: true, lastName: true, interviewDate: true },
    });

    console.log(`📊 Excel: ${summaryData.length} | Base: ${allCandidates.length}\n`);

    let updated = 0;
    let alreadyHasDate = 0;
    let noMatch = 0;
    let noDate = 0;

    for (const row of summaryData) {
      const nomPrenoms = row['Nom & prénoms'];
      const dateEntretien = row['Date d\'entretien'];

      if (!nomPrenoms) continue;
      if (!dateEntretien) { noDate++; continue; }

      const interviewDate = parseInterviewDate(dateEntretien);
      if (!interviewDate) { noDate++; continue; }

      // Find best match
      let bestMatch = null;
      let bestScore = 0;

      for (const candidate of allCandidates) {
        const fullName1 = `${candidate.firstName} ${candidate.lastName}`;
        const fullName2 = `${candidate.lastName} ${candidate.firstName}`;

        const score1 = similarity(nomPrenoms, fullName1);
        const score2 = similarity(nomPrenoms, fullName2);
        const score = Math.max(score1, score2);

        if (score > bestScore) {
          bestScore = score;
          bestMatch = candidate;
        }
      }

      if (!bestMatch || bestScore < 50) {
        console.log(`❌ Pas de correspondance (score: ${bestScore.toFixed(0)}): ${nomPrenoms}`);
        noMatch++;
        continue;
      }

      if (bestMatch.interviewDate) {
        alreadyHasDate++;
        continue;
      }

      await prisma.candidate.update({
        where: { id: bestMatch.id },
        data: { interviewDate },
      });

      console.log(`✅ ${updated + 1}. ${bestMatch.firstName} ${bestMatch.lastName} (${bestScore.toFixed(0)}%) - ${interviewDate.toLocaleDateString('fr-FR')}`);
      updated++;
    }

    console.log('\n' + '='.repeat(80));
    console.log('📈 RÉSUMÉ');
    console.log('='.repeat(80));
    console.log(`✅ Mis à jour: ${updated}`);
    console.log(`✓  Avaient déjà: ${alreadyHasDate}`);
    console.log(`❌ Pas de correspondance: ${noMatch}`);
    console.log(`⚠️  Pas de date: ${noDate}`);
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

updateDates();
