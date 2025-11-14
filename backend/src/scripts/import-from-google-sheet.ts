import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// Mapping des noms de villes pour normalisation
const CITY_MAPPINGS: Record<string, string> = {
  'montreal': 'Montréal',
  'montréal': 'Montréal',
  'mtl': 'Montréal',
  'quebec': 'Québec',
  'québec': 'Québec',
  'qc': 'Québec',
  'laval': 'Laval',
  'gatineau': 'Gatineau',
  'longueuil': 'Longueuil',
  'sherbrooke': 'Sherbrooke',
  'trois-rivieres': 'Trois-Rivières',
  'trois-rivières': 'Trois-Rivières',
  'saguenay': 'Saguenay',
  'levis': 'Lévis',
  'lévis': 'Lévis',
  'terrebonne': 'Terrebonne',
  'saint-jerome': 'Saint-Jérôme',
  'saint-jérôme': 'Saint-Jérôme',
  'st-jerome': 'Saint-Jérôme',
  'st-jérôme': 'Saint-Jérôme',
  'repentigny': 'Repentigny',
  'brossard': 'Brossard',
  'drummondville': 'Drummondville',
  'saint-jean-sur-richelieu': 'Saint-Jean-sur-Richelieu',
  'st-jean-sur-richelieu': 'Saint-Jean-sur-Richelieu',
  'granby': 'Granby',
  'blainville': 'Blainville',
  'shawinigan': 'Shawinigan',
  'dollard-des-ormeaux': 'Dollard-des-Ormeaux',
  'saint-hyacinthe': 'Saint-Hyacinthe',
  'st-hyacinthe': 'Saint-Hyacinthe',
  'pointes aux trembles': 'Pointe-aux-Trembles',
  'pointe-aux-trembles': 'Pointe-aux-Trembles',
};

function normalizeCity(city: string | null | undefined): string | null {
  if (!city) return null;

  const normalized = city
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return CITY_MAPPINGS[normalized] || city.trim();
}

function parseDate(dateStr: string): Date {
  // Format: "Nov 12th 2025, 11:31 am"
  try {
    const parsed = new Date(dateStr);
    // Check if the date is valid
    if (isNaN(parsed.getTime())) {
      return new Date();
    }
    return parsed;
  } catch {
    return new Date();
  }
}

async function fetchGoogleSheetData() {
  const SPREADSHEET_ID = '1ZRxifoWJ0orc0gi8gSAssofmpgyNs2u65y39S3sHZdw';
  const RANGE = 'c1e39384-e185-4a60-a2d5-7307c4720ac6!A2:M'; // Commence à la ligne 2 (après l'en-tête)

  console.log('📊 Récupération des données depuis Google Sheet...\n');

  const sheets = google.sheets('v4');

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE,
      key: process.env.GOOGLE_SHEETS_API_KEY, // Clé API publique
    });

    const rows = response.data.values || [];
    console.log(`✅ ${rows.length} lignes récupérées du Google Sheet\n`);

    return rows;
  } catch (error: any) {
    console.error('❌ Erreur lors de la récupération du Google Sheet:', error.message);
    throw error;
  }
}

async function importProspectFromRow(row: any[], rowIndex: number): Promise<'created' | 'duplicate' | 'skipped'> {
  try {
    // Mapping des colonnes (index commence à 0)
    const firstName = row[0] || '';
    const lastName = row[1] || '';
    const phone = row[2] || '';
    const streetAddress = row[3] || null;
    const city = row[4] || null;
    const postalCode = row[5] || null;
    const province = row[6] || 'QC';
    const email = row[7] || null;
    // row[8] = Address complète (ignorée, on utilise streetAddress)
    const country = row[9] || 'CA';
    const cvUrl = row[10] || null; // Colonne "Svp joindre votre CV"
    // row[11] = Timezone (ignorée)
    const submissionDateStr = row[12] || '';

    // Validation: on a besoin au minimum d'un prénom et d'un téléphone
    if (!firstName || !phone) {
      console.log(`  [${rowIndex}] ⚠️ Ligne ignorée (données manquantes): ${firstName} ${lastName} - ${phone}`);
      return 'skipped';
    }

    // Nettoyer et normaliser le téléphone
    const cleanPhone = phone.replace(/\s/g, '');

    // Vérifier les doublons (par email OU téléphone)
    const existing = await prisma.prospectCandidate.findFirst({
      where: {
        OR: [
          email ? { email } : {},
          { phone: cleanPhone }
        ],
        isDeleted: false,
      }
    });

    if (existing) {
      console.log(`  [${rowIndex}] ⚠️ Doublon: ${firstName} ${lastName} (${email || phone})`);
      return 'duplicate';
    }

    // Normaliser la ville
    const normalizedCity = normalizeCity(city);

    // Parser la date de soumission
    const submissionDate = submissionDateStr ? parseDate(submissionDateStr) : new Date();

    // Créer le prospect
    await prisma.prospectCandidate.create({
      data: {
        firstName,
        lastName: lastName || '',
        email,
        phone: cleanPhone,
        city: normalizedCity,
        streetAddress,
        province,
        postalCode,
        country,
        fullAddress: streetAddress ? `${streetAddress}, ${normalizedCity || city || ''}, ${province}, ${country}` : null,
        cvUrl: cvUrl || null,
        submissionDate,
        isContacted: false,
        isConverted: false,
        notes: cvUrl
          ? 'Importé depuis Google Sheet avec CV'
          : 'Importé depuis Google Sheet',
      },
    });

    console.log(`  [${rowIndex}] ✅ ${firstName} ${lastName} ${cvUrl ? '(avec CV)' : ''}`);
    return 'created';

  } catch (error) {
    console.error(`  [${rowIndex}] ❌ Erreur:`, error);
    return 'skipped';
  }
}

async function main() {
  console.log('🚀 Import des prospects depuis Google Sheet\n');
  console.log('════════════════════════════════════════\n');

  try {
    // Vérifier que la clé API est configurée
    if (!process.env.GOOGLE_SHEETS_API_KEY) {
      throw new Error('GOOGLE_SHEETS_API_KEY non définie dans .env');
    }

    // Récupérer les données du sheet
    const rows = await fetchGoogleSheetData();

    if (rows.length === 0) {
      console.log('⚠️ Aucune donnée trouvée dans le Google Sheet');
      return;
    }

    // Importer chaque ligne
    console.log('📥 Import des prospects...\n');

    let created = 0;
    let duplicates = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const result = await importProspectFromRow(rows[i], i + 2); // +2 car ligne 1 = header, commence à 2

      if (result === 'created') created++;
      else if (result === 'duplicate') duplicates++;
      else skipped++;
    }

    // Résumé
    console.log('\n════════════════════════════════════════');
    console.log('📊 RÉSUMÉ DE L\'IMPORT\n');
    console.log(`✅ Nouveaux prospects créés: ${created}`);
    console.log(`⚠️  Doublons ignorés: ${duplicates}`);
    console.log(`❌ Lignes ignorées: ${skipped}`);
    console.log(`📊 Total traité: ${rows.length}`);
    console.log('════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
