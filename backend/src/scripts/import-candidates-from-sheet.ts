import { PrismaClient, CandidateStatus } from '@prisma/client';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const SPREADSHEET_ID = '1NRGsOHiXc1KtKu0U5WHbQRzgGQlL298Sz83W0U6mi1Q';

// Parser une note comme "8/10" ou "6,5/10" → 8.0 ou 6.5
function parseNote(noteStr: string): number | null {
  if (!noteStr) return null;

  // Extraire le nombre avant "/10"
  const match = noteStr.match(/([\d,\.]+)\s*\/\s*10/);
  if (!match) return null;

  // Remplacer la virgule par un point et parser
  const numStr = match[1].replace(',', '.');
  const num = parseFloat(numStr);

  return isNaN(num) ? null : num;
}

// Déterminer le statut basé sur la note
function getStatusFromRating(rating: number | null): CandidateStatus {
  if (!rating) return 'EN_ATTENTE';

  if (rating >= 9.5) return 'ELITE';
  if (rating >= 9.0) return 'EXCELLENT';
  if (rating >= 8.5) return 'TRES_BON';
  if (rating >= 8.0) return 'BON';
  if (rating >= 7.0) return 'QUALIFIE';
  return 'A_REVOIR';
}

// Splitter un nom complet en prénom et nom
function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  // Le dernier mot est le nom de famille, le reste est le prénom
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');

  return { firstName, lastName };
}

// Nettoyer un numéro de téléphone
function cleanPhone(phone: string): string {
  return phone.replace(/[\s\(\)\-]/g, '');
}

// Parser une date au format MM/DD/YYYY
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

// Lire les données détaillées d'un onglet candidat
async function readCandidateSheet(sheetName: string): Promise<any> {
  const sheets = google.sheets('v4');

  try {
    // Entourer le nom de l'onglet de guillemets simples pour gérer les noms avec points
    const range = `'${sheetName}'!A1:B100`;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range,
      key: process.env.GOOGLE_SHEETS_API_KEY,
    });

    const rows = response.data.values || [];

    // Convertir en objet clé-valeur
    const data: any = {};

    rows.forEach((row) => {
      if (row.length >= 2) {
        const key = row[0]?.trim();
        const value = row[1]?.trim();

        if (key && value) {
          data[key] = value;
        }
      }
    });

    return data;
  } catch (error: any) {
    console.error(`   ❌ Erreur lecture onglet "${sheetName}":`, error.message);
    return {};
  }
}

// Importer un candidat depuis une ligne du récapitulatif
async function importCandidate(row: any[], rowIndex: number, createdById: string): Promise<'created' | 'skipped' | 'error'> {
  try {
    const numero = row[0] || '';
    const nomComplet = row[1] || '';
    const email = row[2] || null;
    const phone = row[3] || '';
    const ville = row[4] || '';
    const dateEntretien = row[5] || '';
    const noteStr = row[6] || '';
    // row[7] = Mail (skip)
    const lienEntretien = row[8] || '';
    const avisRH = row[9] || '';
    const videoUrl = row[10] || null;

    // Validation: on a besoin au minimum d'un nom et d'un téléphone
    if (!nomComplet || !phone) {
      console.log(`  [${rowIndex}] ⚠️ Ignoré (données manquantes): ${nomComplet}`);
      return 'skipped';
    }

    // Splitter nom/prénom
    const { firstName, lastName } = splitFullName(nomComplet);

    // Parser la note
    const globalRating = parseNote(noteStr);
    const status = getStatusFromRating(globalRating);

    // Nettoyer le téléphone
    const cleanedPhone = cleanPhone(phone);

    // Parser la date
    const interviewDate = parseDate(dateEntretien);

    // Construire le nom de l'onglet individuel (ex: "1. Jean-Marie NBONDA")
    const sheetName = `${numero}. ${firstName} ${lastName}`.trim();

    console.log(`  [${rowIndex}] 📄 Lecture onglet: "${sheetName}"...`);

    // Lire les données détaillées de l'onglet
    const interviewDetails = await readCandidateSheet(sheetName);

    // Créer le candidat
    await prisma.candidate.create({
      data: {
        firstName,
        lastName,
        email: email || null,
        phone: cleanedPhone,
        city: ville || 'Québec', // Valeur par défaut
        province: 'QC',
        globalRating,
        status,
        interviewDate,
        hrNotes: avisRH || null,
        interviewDetails: interviewDetails && Object.keys(interviewDetails).length > 0 ? interviewDetails : null,
        videoUrl: videoUrl || null,
        createdById, // Utilisateur système

        // Champs obligatoires avec valeurs par défaut
        hasVehicle: false,
        hasBSP: false,
        hasDriverLicense: false,
        isDeleted: false,
      },
    });

    console.log(`  [${rowIndex}] ✅ ${firstName} ${lastName} (Note: ${noteStr} → ${globalRating || 'N/A'})`);
    return 'created';

  } catch (error: any) {
    console.error(`  [${rowIndex}] ❌ Erreur:`, error.message);
    return 'error';
  }
}

async function main() {
  console.log('🚀 Import des candidats depuis Google Sheet\n');
  console.log('════════════════════════════════════════\n');

  try {
    // Vérifier que la clé API est configurée
    if (!process.env.GOOGLE_SHEETS_API_KEY) {
      throw new Error('GOOGLE_SHEETS_API_KEY non définie dans .env');
    }

    // ÉTAPE 0: Récupérer ou créer un utilisateur système
    console.log('👤 Vérification de l\'utilisateur système...\n');

    let systemUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });

    if (!systemUser) {
      // Créer un utilisateur système si aucun admin n'existe
      console.log('   ⚠️  Aucun admin trouvé, création d\'un utilisateur système...');
      systemUser = await prisma.user.create({
        data: {
          email: 'system@xguard.com',
          firstName: 'Système',
          lastName: 'Import',
          role: 'ADMIN',
          password: '$2b$10$abcdefghijklmnopqrstuvwxyz', // Hash bidon, login impossible
        },
      });
      console.log('   ✅ Utilisateur système créé\n');
    } else {
      console.log(`   ✅ Utilisateur: ${systemUser.firstName} ${systemUser.lastName}\n`);
    }

    const createdById = systemUser.id;

    // ÉTAPE 1: Supprimer tous les anciens candidats
    console.log('🗑️  Suppression des anciens candidats...\n');

    const deleteResult = await prisma.candidate.deleteMany({});
    console.log(`✅ ${deleteResult.count} ancien(s) candidat(s) supprimé(s)\n`);

    // ÉTAPE 2: Récupérer les données du récapitulatif
    console.log('📊 Récupération des données depuis l\'onglet "Récapitulatif xguard"...\n');

    const sheets = google.sheets('v4');

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Récapitulatif xguard !A2:K200', // Lignes 2 à 200 (skip header)
      key: process.env.GOOGLE_SHEETS_API_KEY,
    });

    const rows = response.data.values || [];
    console.log(`✅ ${rows.length} candidats trouvés dans le récapitulatif\n`);

    if (rows.length === 0) {
      console.log('⚠️ Aucune donnée trouvée');
      return;
    }

    // ÉTAPE 3: Importer chaque candidat
    console.log('📥 Import des candidats avec leurs données détaillées...\n');

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Stop si la ligne est vide
      if (!row || row.length === 0 || !row[0]) {
        break;
      }

      const result = await importCandidate(row, i + 2, createdById); // +2 car ligne 1 = header, commence à 2

      if (result === 'created') created++;
      else if (result === 'skipped') skipped++;
      else errors++;
    }

    // ÉTAPE 4: Résumé
    console.log('\n════════════════════════════════════════');
    console.log('📊 RÉSUMÉ DE L\'IMPORT\n');
    console.log(`✅ Candidats créés: ${created}`);
    console.log(`⚠️  Candidats ignorés: ${skipped}`);
    console.log(`❌ Erreurs: ${errors}`);
    console.log(`📊 Total traité: ${rows.length}`);
    console.log('════════════════════════════════════════\n');

  } catch (error: any) {
    console.error('❌ Erreur fatale:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
