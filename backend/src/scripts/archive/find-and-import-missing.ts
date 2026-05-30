import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXCEL_FILE_PATH = 'C:\\Recrutement\\Grille d\'entretiens xguard.security (1).xlsx';

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
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 90;

  const words1 = norm1.split(' ');
  const words2 = norm2.split(' ');

  const shorter = words1.length < words2.length ? words1 : words2;
  const longer = words1.length < words2.length ? words2 : words1;

  let matchCount = 0;
  for (const word of shorter) {
    if (longer.some(w => w.includes(word) || word.includes(w))) {
      matchCount++;
    }
  }

  return (matchCount / shorter.length) * 100;
}

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

async function findAndImportMissing() {
  console.log('🔍 Recherche des candidats manquants...\n');

  try {
    // Get first user to associate with candidates
    const firstUser = await prisma.user.findFirst();
    if (!firstUser) {
      console.error('❌ Aucun utilisateur trouvé. Créez un utilisateur d\'abord.');
      return;
    }

    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const summarySheet = workbook.Sheets['Récapitulatif xguard '];
    const summaryData = XLSX.utils.sheet_to_json(summarySheet) as any[];

    const allCandidates = await prisma.candidate.findMany({
      where: { isDeleted: false },
      select: { firstName: true, lastName: true }
    });

    console.log(`📊 Excel: ${summaryData.length} candidats`);
    console.log(`📊 Base de données: ${allCandidates.length} candidats\n`);

    const missing: any[] = [];

    for (const row of summaryData) {
      const nomPrenoms = row['Nom & prénoms'];
      if (!nomPrenoms) continue;

      // Check if exists in database
      let found = false;
      let bestScore = 0;

      for (const candidate of allCandidates) {
        const fullName = `${candidate.firstName} ${candidate.lastName}`;
        const score = similarity(nomPrenoms, fullName);

        if (score > bestScore) {
          bestScore = score;
        }

        if (score >= 80) {
          found = true;
          break;
        }
      }

      if (!found) {
        console.log(`❌ Manquant: ${nomPrenoms} (meilleur match: ${bestScore.toFixed(0)}%)`);
        missing.push(row);
      }
    }

    console.log(`\n📊 Total candidats manquants: ${missing.length}\n`);

    if (missing.length === 0) {
      console.log('✅ Tous les candidats de l\'Excel sont déjà dans la base!');
      return;
    }

    // Import missing candidates
    console.log('📥 Importation des candidats manquants...\n');

    let imported = 0;

    for (const row of missing) {
      try {
        const nomPrenoms = row['Nom & prénoms'] || '';

        // Split name (usually "Nom Prenom" or "Prenom Nom")
        const parts = nomPrenoms.trim().split(/\s+/);
        const firstName = parts.slice(0, -1).join(' ') || parts[0] || 'Inconnu';
        const lastName = parts[parts.length - 1] || 'Inconnu';

        const email = row['Adresse mail'] ? String(row['Adresse mail']).trim() : undefined;
        const phone = row['Contact'] ? String(row['Contact']).trim() : '';
        const city = row['Ville'] ? String(row['Ville']).trim() : '';

        const interviewDate = parseInterviewDate(row['Date d\'entretien']);
        const globalRating = parseRating(row['Note']);
        const hrNotes = row['Avis RH'] ? String(row['Avis RH']).trim() : undefined;
        const videoUrl = row['Vidéo d\'entrevue'] ? String(row['Vidéo d\'entrevue']).trim() : undefined;

        const candidate = await prisma.candidate.create({
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

        console.log(`✅ ${imported + 1}. Importé: ${firstName} ${lastName}`);
        imported++;

      } catch (error: any) {
        console.error(`❌ Erreur pour ${row['Nom & prénoms']}: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📈 RÉSUMÉ');
    console.log('='.repeat(80));
    console.log(`❌ Candidats manquants trouvés: ${missing.length}`);
    console.log(`✅ Candidats importés: ${imported}`);
    console.log(`📊 Total maintenant: ${allCandidates.length + imported}`);
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

findAndImportMissing();
