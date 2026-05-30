import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXCEL_FILE_PATH = 'C:\\Recrutement\\Grille d\'entretiens xguard.security (1).xlsx';

// Helper function to convert Excel date number to JavaScript Date
function excelDateToJSDate(excelDate: number): Date {
  const EXCEL_EPOCH = new Date(1899, 11, 30);
  const daysOffset = excelDate;
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return new Date(EXCEL_EPOCH.getTime() + daysOffset * millisecondsPerDay);
}

// Helper function to parse interview date
function parseInterviewDate(dateValue: any): Date | null {
  if (!dateValue) return null;

  if (typeof dateValue === 'number') {
    return excelDateToJSDate(dateValue);
  }

  if (dateValue instanceof Date) {
    return dateValue;
  }

  if (typeof dateValue === 'string') {
    const parsed = new Date(dateValue);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

// Normalize name for comparison
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z\s]/g, '') // Remove special chars
    .trim();
}

async function updateDates() {
  console.log('🚀 Mise à jour des dates par nom...\n');

  try {
    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const summarySheet = workbook.Sheets['Récapitulatif xguard '];
    const summaryData = XLSX.utils.sheet_to_json(summarySheet) as any[];

    console.log(`📊 ${summaryData.length} candidats dans Excel\n`);

    // Get all candidates from database
    const allCandidates = await prisma.candidate.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        interviewDate: true,
      },
    });

    console.log(`📊 ${allCandidates.length} candidats dans la base\n`);

    let updated = 0;
    let skipped = 0;
    let alreadyHasDate = 0;

    for (const row of summaryData) {
      try {
        const nomPrenoms = row['Nom & prénoms'];
        const dateEntretien = row['Date d\'entretien'];

        if (!nomPrenoms) {
          skipped++;
          continue;
        }

        if (!dateEntretien) {
          skipped++;
          continue;
        }

        // Parse the interview date
        const interviewDate = parseInterviewDate(dateEntretien);
        if (!interviewDate) {
          skipped++;
          continue;
        }

        // Normalize the name from Excel
        const normalizedExcelName = normalizeName(nomPrenoms);

        // Find matching candidate by name similarity
        let bestMatch = null;
        let bestScore = 0;

        for (const candidate of allCandidates) {
          const candidateFullName = `${candidate.firstName} ${candidate.lastName}`;
          const normalizedCandidateName = normalizeName(candidateFullName);

          // Check if names match (contains or are contained)
          const score1 = normalizedExcelName.includes(normalizedCandidateName) ? 1 : 0;
          const score2 = normalizedCandidateName.includes(normalizedExcelName) ? 1 : 0;
          const score = Math.max(score1, score2);

          if (score > bestScore) {
            bestScore = score;
            bestMatch = candidate;
          }
        }

        if (!bestMatch || bestScore === 0) {
          console.log(`❌ Pas de correspondance pour: ${nomPrenoms}`);
          skipped++;
          continue;
        }

        // Check if already has a date
        if (bestMatch.interviewDate) {
          alreadyHasDate++;
          continue;
        }

        // Update the candidate
        await prisma.candidate.update({
          where: { id: bestMatch.id },
          data: { interviewDate },
        });

        console.log(`✅ ${updated + 1}. ${bestMatch.firstName} ${bestMatch.lastName} - Date: ${interviewDate.toLocaleDateString('fr-FR')}`);
        updated++;

      } catch (error: any) {
        console.error(`❌ Erreur pour ${row['Nom & prénoms']}: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📈 RÉSUMÉ');
    console.log('='.repeat(80));
    console.log(`✅ Candidats mis à jour: ${updated}`);
    console.log(`✓  Avaient déjà une date: ${alreadyHasDate}`);
    console.log(`⏭️  Ignorés (pas de date/match): ${skipped}`);
    console.log(`📊 Total dans Excel: ${summaryData.length}`);
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('❌ Erreur fatale:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

updateDates();
