import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXCEL_FILE_PATH = 'C:\\Recrutement\\Grille d\'entretiens xguard.security (1).xlsx';

// Helper function to parse candidate data from individual sheet
function parseCandidateSheet(worksheet: XLSX.WorkSheet): any {
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

  const candidateData: any = {};

  data.forEach((row) => {
    if (row && row[0] !== undefined && row[0] !== null) {
      const key = row[0]?.toString().trim();
      const value = row[1] !== undefined && row[1] !== null ? row[1].toString().trim() : '';

      if (key) {
        candidateData[key] = value;
      }
    }
  });

  return candidateData;
}

// Helper function to convert Excel date number to JavaScript Date
function excelDateToJSDate(excelDate: number): Date {
  // Excel dates are stored as days since 1900-01-01
  // But Excel incorrectly treats 1900 as a leap year, so we need to account for that
  const EXCEL_EPOCH = new Date(1899, 11, 30); // December 30, 1899
  const daysOffset = excelDate;
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return new Date(EXCEL_EPOCH.getTime() + daysOffset * millisecondsPerDay);
}

// Helper function to parse interview date
function parseInterviewDate(dateValue: any): Date | null {
  if (!dateValue) return null;

  // If it's a number (Excel format)
  if (typeof dateValue === 'number') {
    return excelDateToJSDate(dateValue);
  }

  // If it's already a date object
  if (dateValue instanceof Date) {
    return dateValue;
  }

  // If it's a string, try to parse it
  if (typeof dateValue === 'string') {
    const parsed = new Date(dateValue);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

async function updateInterviewDates() {
  console.log('🚀 Mise à jour des dates d\'entrevue...\n');

  try {
    // Read the Excel file
    const workbook = XLSX.readFile(EXCEL_FILE_PATH);

    // Get the summary sheet
    const summarySheet = workbook.Sheets['Récapitulatif xguard '];
    const summaryData = XLSX.utils.sheet_to_json(summarySheet) as any[];

    console.log(`📊 ${summaryData.length} candidats trouvés dans la feuille récapitulative\n`);

    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const row of summaryData) {
      try {
        const nomPrenoms = row['Nom & prénoms'];
        const email = row['Adresse mail'];
        const phone = row['Contact'];
        const dateEntretien = row['Date d\'entretien'];

        if (!nomPrenoms) {
          skipped++;
          continue;
        }

        // Try to find the candidate by phone or email
        const phoneClean = phone?.toString().replace(/[^\d+]/g, '');

        const candidate = await prisma.candidate.findFirst({
          where: {
            OR: [
              email ? { email } : { id: '' }, // Dummy query if no email
              phoneClean ? { phone: phoneClean } : { id: '' },
            ],
            isDeleted: false,
          },
        });

        if (!candidate) {
          console.log(`⚠️  Candidat non trouvé: ${nomPrenoms}`);
          notFound++;
          continue;
        }

        // Parse the interview date
        const interviewDate = parseInterviewDate(dateEntretien);

        if (!interviewDate) {
          console.log(`⚠️  Pas de date pour: ${nomPrenoms}`);
          skipped++;
          continue;
        }

        // Update the candidate
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: { interviewDate },
        });

        console.log(`✅ ${updated + 1}. ${candidate.firstName} ${candidate.lastName} - Date: ${interviewDate.toLocaleDateString('fr-FR')}`);
        updated++;

      } catch (error: any) {
        console.error(`❌ Erreur pour ${row['Nom & prénoms']}: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📈 RÉSUMÉ DE LA MISE À JOUR');
    console.log('='.repeat(80));
    console.log(`✅ Candidats mis à jour: ${updated}`);
    console.log(`⏭️  Candidats ignorés (pas de date): ${skipped}`);
    console.log(`❓ Candidats non trouvés: ${notFound}`);
    console.log(`📊 Total: ${summaryData.length}`);
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('❌ Erreur fatale:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

updateInterviewDates();
