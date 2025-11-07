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

// Parse rating from Excel
function parseRating(ratingValue: any): number | null {
  if (!ratingValue) return null;

  const str = String(ratingValue).trim();
  if (str.toLowerCase().includes('abs')) return null;

  const match = str.match(/([0-9,\.]+)\s*\/\s*10/);
  if (match) {
    const num = match[1].replace(',', '.');
    const rating = parseFloat(num);
    return isNaN(rating) ? null : rating;
  }

  return null;
}

// Parse name to firstName and lastName
function parseName(nomPrenoms: string): { firstName: string; lastName: string } {
  const parts = nomPrenoms.trim().split(/\s+/);

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'N/A' };
  }

  // Last word is usually the lastName
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');

  return { firstName, lastName };
}

async function resetAndImportAll() {
  console.log('🔄 RÉINITIALISATION COMPLÈTE ET RÉIMPORTATION...\n');

  try {
    // Get first user
    const firstUser = await prisma.user.findFirst();
    if (!firstUser) {
      console.error('❌ Aucun utilisateur trouvé. Créez un utilisateur d\'abord.');
      return;
    }

    console.log('1️⃣  Suppression de tous les candidats existants...\n');

    const deleteResult = await prisma.candidate.updateMany({
      where: { isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() }
    });

    console.log(`✅ ${deleteResult.count} candidats supprimés\n`);

    console.log('2️⃣  Lecture de l\'Excel...\n');

    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const summarySheet = workbook.Sheets['Récapitulatif xguard '];
    const summaryData = XLSX.utils.sheet_to_json(summarySheet) as any[];

    console.log(`📊 ${summaryData.length} lignes trouvées dans l\'Excel\n`);

    console.log('3️⃣  Importation des candidats...\n');

    let imported = 0;
    let skipped = 0;
    const seen = new Set<string>();

    for (const row of summaryData) {
      try {
        const nomPrenoms = row['Nom & prénoms'];

        if (!nomPrenoms) {
          skipped++;
          continue;
        }

        // Skip duplicates
        const normalized = nomPrenoms.toLowerCase().trim();
        if (seen.has(normalized)) {
          console.log(`⚠️  Doublon ignoré: ${nomPrenoms}`);
          skipped++;
          continue;
        }
        seen.add(normalized);

        const { firstName, lastName } = parseName(nomPrenoms);

        const email = row['Adresse mail'] ? String(row['Adresse mail']).trim() : undefined;
        const phone = row['Contact'] ? String(row['Contact']).trim() : '';
        const city = row['Ville'] ? String(row['Ville']).trim() : '';

        const interviewDate = parseInterviewDate(row['Date d\'entretien']);
        const globalRating = parseRating(row['Note']);
        const hrNotes = row['Avis RH'] ? String(row['Avis RH']).trim() : undefined;
        const videoUrl = row['Vidéo d\'entrevue'] ? String(row['Vidéo d\'entrevue']).trim() : undefined;

        await prisma.candidate.create({
          data: {
            firstName,
            lastName,
            email: email && email !== 'undefined' && email.includes('@') ? email : undefined,
            phone: phone || 'N/A',
            city: city || 'N/A',
            province: 'Québec',
            status: 'EN_ATTENTE',
            interviewDate: interviewDate || undefined,
            globalRating: globalRating || undefined,
            hrNotes: hrNotes && hrNotes !== 'undefined' ? hrNotes : undefined,
            videoUrl: videoUrl && videoUrl !== 'undefined' ? videoUrl : undefined,
            hasVehicle: false,
            hasBSP: false,
            isActive: true,
            isDeleted: false,
            createdById: firstUser.id,
          },
        });

        imported++;
        if (imported % 10 === 0) {
          console.log(`✅ ${imported} candidats importés...`);
        }

      } catch (error: any) {
        console.error(`❌ Erreur pour ${row['Nom & prénoms']}: ${error.message}`);
        skipped++;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📈 RÉSUMÉ FINAL');
    console.log('='.repeat(80));
    console.log(`🗑️  Candidats supprimés: ${deleteResult.count}`);
    console.log(`✅ Candidats importés: ${imported}`);
    console.log(`⏭️  Lignes ignorées: ${skipped}`);
    console.log(`📊 Total final: ${imported}`);
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetAndImportAll();
