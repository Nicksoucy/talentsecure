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

// Calculate similarity score with word matching
function similarity(s1: string, s2: string): number {
  const norm1 = normalize(s1);
  const norm2 = normalize(s2);

  if (norm1 === norm2) return 100;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 90;

  const words1 = norm1.split(' ');
  const words2 = norm2.split(' ');

  // Check if all words from the shorter name are in the longer name
  const shorter = words1.length < words2.length ? words1 : words2;
  const longer = words1.length < words2.length ? words2 : words1;

  let matchCount = 0;
  for (const word of shorter) {
    if (longer.some(w => w.includes(word) || word.includes(w))) {
      matchCount++;
    }
  }

  const matchPercent = (matchCount / shorter.length) * 100;
  return matchPercent;
}

async function updateMissingDates() {
  console.log('🔄 Mise à jour des dates manquantes...\n');

  try {
    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const summarySheet = workbook.Sheets['Récapitulatif xguard '];
    const summaryData = XLSX.utils.sheet_to_json(summarySheet) as any[];

    // Get candidates WITHOUT interview date
    const candidatesWithoutDate = await prisma.candidate.findMany({
      where: {
        isDeleted: false,
        interviewDate: null
      },
      select: { id: true, firstName: true, lastName: true, phone: true, email: true },
    });

    console.log(`📊 Candidats sans date: ${candidatesWithoutDate.length}\n`);

    let updated = 0;
    let noMatch = 0;

    for (const candidate of candidatesWithoutDate) {
      const fullName = `${candidate.firstName} ${candidate.lastName}`;

      // Find best match in Excel
      let bestMatch = null;
      let bestScore = 0;

      for (const row of summaryData) {
        const nomPrenoms = row['Nom & prénoms'];
        if (!nomPrenoms) continue;

        const score = similarity(fullName, nomPrenoms);

        if (score > bestScore) {
          bestScore = score;
          bestMatch = row;
        }
      }

      if (!bestMatch || bestScore < 70) {
        console.log(`❌ Pas de correspondance (${bestScore.toFixed(0)}%): ${fullName}`);
        noMatch++;
        continue;
      }

      const dateEntretien = bestMatch['Date d\'entretien'];
      if (!dateEntretien) {
        console.log(`⚠️  Pas de date dans Excel pour: ${fullName}`);
        continue;
      }

      const interviewDate = parseInterviewDate(dateEntretien);
      if (!interviewDate) {
        console.log(`⚠️  Date invalide pour: ${fullName}`);
        continue;
      }

      // Update candidate
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { interviewDate },
      });

      console.log(`✅ ${updated + 1}. ${fullName} (${bestScore.toFixed(0)}% match avec "${bestMatch['Nom & prénoms']}") - ${interviewDate.toLocaleDateString('fr-FR')}`);
      updated++;
    }

    console.log('\n' + '='.repeat(80));
    console.log('📈 RÉSUMÉ');
    console.log('='.repeat(80));
    console.log(`✅ Dates ajoutées: ${updated}`);
    console.log(`❌ Pas de correspondance: ${noMatch}`);
    console.log(`📊 Total traités: ${candidatesWithoutDate.length}`);
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

updateMissingDates();
