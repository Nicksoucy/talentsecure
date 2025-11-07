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

// Helper function to extract first and last name
function extractNames(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(' ');

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  // Last name is usually first in the format
  const lastName = parts[0];
  const firstName = parts.slice(1).join(' ');

  return { firstName, lastName };
}

// Helper function to parse phone number
function parsePhone(phone: string): string {
  if (!phone) return '';
  // Remove all non-numeric characters except +
  return phone.toString().replace(/[^\d+]/g, '');
}

// Helper function to parse rating
function parseRating(ratingStr: string): number | null {
  if (!ratingStr) return null;

  const match = ratingStr.match(/(\d+(?:[,\.]\d+)?)\s*\/\s*10/);
  if (match) {
    const rating = parseFloat(match[1].replace(',', '.'));
    return Math.round(rating * 10) / 10; // Round to 1 decimal
  }

  return null;
}

// Helper function to convert Excel date number to JavaScript Date
function excelDateToJSDate(excelDate: number): Date {
  // Excel dates are stored as days since 1900-01-01
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

// Helper function to determine status based on rating
function determineStatus(rating: number | null): string {
  if (!rating) return 'EN_ATTENTE';

  if (rating >= 9) return 'ELITE';
  if (rating >= 8) return 'EXCELLENT';
  if (rating >= 7) return 'TRES_BON';
  if (rating >= 6) return 'BON';
  if (rating >= 5) return 'QUALIFIE';

  return 'A_REVOIR';
}

// Helper function to parse BSP status
function parseBSP(bspStr: string): boolean {
  if (!bspStr) return false;
  const lower = bspStr.toLowerCase().trim();
  return lower === 'oui' || lower === 'yes' || lower === 'true' || lower === '✓';
}

// Helper function to parse languages
function parseLanguages(frenchLevel: string, englishLevel: string, otherLangs: string): any[] {
  const languages: any[] = [];

  // French
  if (frenchLevel && frenchLevel !== 'Incompréhensible - Compréhensible - Moyen - Bon - Très Bon') {
    const level = frenchLevel.includes('Très Bon') || frenchLevel.includes('Très bon') ? 'LANGUE_MATERNELLE' :
                  frenchLevel.includes('Bon') ? 'AVANCE' :
                  frenchLevel.includes('Moyen') ? 'INTERMEDIAIRE' :
                  frenchLevel.includes('Compréhensible') ? 'DEBUTANT' : 'DEBUTANT';

    languages.push({ language: 'Français', level });
  }

  // English
  if (englishLevel && englishLevel !== 'Incompréhensible - Compréhensible - Moyen - Bon - Très Bon') {
    const level = englishLevel.includes('Très Bon') || englishLevel.includes('Très bon') ? 'LANGUE_MATERNELLE' :
                  englishLevel.includes('Bon') ? 'AVANCE' :
                  englishLevel.includes('Moyen') ? 'INTERMEDIAIRE' :
                  englishLevel.includes('Compréhensible') ? 'DEBUTANT' : 'DEBUTANT';

    languages.push({ language: 'Anglais', level });
  }

  // Other languages
  if (otherLangs && otherLangs.trim() !== '') {
    const otherLangsList = otherLangs.split(',').map(l => l.trim()).filter(l => l !== '');
    otherLangsList.forEach(lang => {
      languages.push({ language: lang, level: 'INTERMEDIAIRE' });
    });
  }

  return languages;
}

// Helper function to parse availability
function parseAvailability(disponibilitesShift: string, disponibilitesWeek: string): any[] {
  const availabilities: any[] = [];

  const hasJour = disponibilitesShift?.includes('Jour') || false;
  const hasSoir = disponibilitesShift?.includes('Soir') || false;
  const hasNuit = disponibilitesShift?.includes('Nuit') || false;
  const hasLes3 = disponibilitesShift?.includes('Les 3') || disponibilitesShift?.includes('les 3') || false;

  const hasWeekend = disponibilitesWeek?.includes('Fin de semaine') || disponibilitesWeek?.includes('Weekend') || disponibilitesWeek?.includes('weekend') || false;

  // Add shift types
  if (hasLes3 || hasJour) {
    availabilities.push({ type: 'JOUR' });
  }
  if (hasLes3 || hasSoir) {
    availabilities.push({ type: 'SOIR' });
  }
  if (hasLes3 || hasNuit) {
    availabilities.push({ type: 'NUIT' });
  }
  if (hasWeekend) {
    availabilities.push({ type: 'FIN_DE_SEMAINE' });
  }

  return availabilities;
}

async function importCandidates() {
  console.log('🚀 Début de l\'import des candidats...\n');

  try {
    // Get the test user ID
    const testUser = await prisma.user.findUnique({
      where: { email: 'test@xguard.com' },
    });

    if (!testUser) {
      throw new Error('User test@xguard.com not found. Please create it first.');
    }

    console.log(`👤 Utilisateur trouvé: ${testUser.email} (ID: ${testUser.id})\n`);

    // Read the Excel file
    const workbook = XLSX.readFile(EXCEL_FILE_PATH);

    // Get the summary sheet
    const summarySheet = workbook.Sheets['Récapitulatif xguard '];
    const summaryData = XLSX.utils.sheet_to_json(summarySheet) as any[];

    console.log(`📊 ${summaryData.length} candidats trouvés dans la feuille récapitulative\n`);

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of summaryData) {
      try {
        const numero = row['N°'];
        const nomPrenoms = row['Nom & prénoms'];
        const email = row['Adresse mail'];
        const contact = row['Contact'];
        const note = row['Note'];
        const avisRH = row['Avis RH'];
        const dateEntretien = row['Date d\'entretien'];

        if (!nomPrenoms) {
          skipped++;
          continue;
        }

        // Find the individual sheet for this candidate
        const candidateSheetName = workbook.SheetNames.find(name =>
          name.includes(nomPrenoms.split(' ')[0]) ||
          name.includes(nomPrenoms.split(' ')[1]) ||
          (numero && name.startsWith(`${numero}.`))
        );

        let detailedData: any = {};
        if (candidateSheetName && workbook.Sheets[candidateSheetName]) {
          detailedData = parseCandidateSheet(workbook.Sheets[candidateSheetName]);
        }

        // Extract names
        const identite = detailedData['Identité (Nom - Prénom - Age - Nationalité)'] || nomPrenoms;
        const { firstName, lastName } = extractNames(identite.split('-')[0]?.trim() || nomPrenoms);

        // Parse phone
        const phone = parsePhone(contact || detailedData['Contact']);

        // Parse city
        const city = detailedData['Localisation : Déplacement/déménagement'] || row['Ville'] || '';

        // Parse rating
        const globalRating = parseRating(detailedData['Note'] || note);

        // Determine status
        const status = determineStatus(globalRating);

        // Parse interview date
        const interviewDate = parseInterviewDate(detailedData['Date de l\'entretien'] || dateEntretien);

        // Parse BSP
        const hasBSP = parseBSP(detailedData['BSP']);

        // Parse vehicle
        const hasVehicle = detailedData['Véhiculé ou non ?']?.toLowerCase().includes('oui') || false;

        // Parse languages
        const languages = parseLanguages(
          detailedData['Français'] || '',
          detailedData['Anglais'] || '',
          detailedData['Autres langues'] || ''
        );

        // Parse availability
        const availabilities = parseAvailability(
          detailedData['Disponibilités(Shift) : Jour/Soir/Nuit/ les 3'] || '',
          detailedData['en Semaine/Fin de semaine/ les 2'] || ''
        );

        // Create candidate
        const candidate = await prisma.candidate.create({
          data: {
            firstName,
            lastName,
            phone,
            email: email || undefined,
            city,
            status,
            globalRating,
            interviewDate: interviewDate || undefined,
            hasBSP,
            hasVehicle,
            hrNotes: avisRH || detailedData['Avis RH (Banjina)'] || '',
            createdById: testUser.id,

            // Create nested relations
            ...(languages.length > 0 && {
              languages: {
                create: languages,
              },
            }),

            ...(availabilities.length > 0 && {
              availabilities: {
                create: availabilities,
              },
            }),
          },
        });

        console.log(`✅ ${imported + 1}. ${firstName} ${lastName} - Note: ${globalRating || 'N/A'}/10 - Status: ${status}`);
        imported++;

      } catch (error: any) {
        console.error(`❌ Erreur pour ${row['Nom & prénoms']}: ${error.message}`);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📈 RÉSUMÉ DE L\'IMPORT');
    console.log('='.repeat(80));
    console.log(`✅ Candidats importés: ${imported}`);
    console.log(`⏭️  Candidats ignorés: ${skipped}`);
    console.log(`❌ Erreurs: ${errors}`);
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

importCandidates();
