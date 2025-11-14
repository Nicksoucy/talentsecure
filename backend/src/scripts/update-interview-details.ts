import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const SPREADSHEET_ID = '1NRGsOHiXc1KtKu0U5WHbQRzgGQlL298Sz83W0U6mi1Q';

// Lire les données détaillées d'un onglet candidat avec plusieurs formats
async function readCandidateSheet(numero: string, firstName: string, lastName: string): Promise<any> {
  const sheets = google.sheets('v4');

  // Essayer plusieurs formats de noms d'onglets
  const possibleNames = [
    `${numero}.${firstName} ${lastName}`,           // "1.Jean-Marie NBONDA"
    `${numero}. ${firstName} ${lastName}`,          // "1. Jean-Marie NBONDA"
    `${numero}.${firstName} ${lastName} `,          // "1.Jean-Marie NBONDA " (trailing space)
    `${numero}. ${firstName} ${lastName} `,         // "1. Jean-Marie NBONDA " (trailing space)
  ];

  for (const sheetName of possibleNames) {
    try {
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

      // Si on a trouvé des données, retourner
      if (Object.keys(data).length > 0) {
        console.log(`      ✅ Trouvé avec format: "${sheetName}"`);
        return data;
      }

    } catch (error: any) {
      // Continuer avec le prochain format
      continue;
    }
  }

  // Aucun format n'a fonctionné
  console.log(`      ❌ Onglet non trouvé (essayé ${possibleNames.length} formats)`);
  return null;
}

// Délai pour éviter les limites de quota API
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🔄 Mise à jour des détails d\'entrevue des candidats\n');
  console.log('════════════════════════════════════════\n');

  try {
    // Vérifier que la clé API est configurée
    if (!process.env.GOOGLE_SHEETS_API_KEY) {
      throw new Error('GOOGLE_SHEETS_API_KEY non définie dans .env');
    }

    // Récupérer tous les candidats sans interviewDetails (ou tous les candidats)
    console.log('📊 Récupération des candidats...\n');

    const candidates = await prisma.candidate.findMany({
      orderBy: { id: 'asc' },
    });

    console.log(`✅ ${candidates.length} candidats trouvés\n`);

    if (candidates.length === 0) {
      console.log('⚠️ Aucun candidat à mettre à jour');
      return;
    }

    // Trouver le numéro pour chaque candidat
    // On va devoir récupérer le récapitulatif pour matcher les candidats
    console.log('📄 Récupération du récapitulatif...\n');

    const sheets = google.sheets('v4');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Récapitulatif xguard !A2:K200',
      key: process.env.GOOGLE_SHEETS_API_KEY,
    });

    const rows = response.data.values || [];

    // Créer un mapping téléphone -> numéro
    const phoneToNumero: { [key: string]: string } = {};
    rows.forEach((row) => {
      if (row[0] && row[3]) {
        const numero = row[0];
        const phone = row[3].replace(/[\s\(\)\-]/g, ''); // Nettoyer
        phoneToNumero[phone] = numero;
      }
    });

    console.log(`✅ ${Object.keys(phoneToNumero).length} numéros mappés\n`);

    // Mettre à jour chaque candidat
    console.log('🔄 Mise à jour des détails d\'entrevue...\n');

    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const progress = `[${i + 1}/${candidates.length}]`;

      // Trouver le numéro du candidat
      const numero = phoneToNumero[candidate.phone];

      if (!numero) {
        console.log(`${progress} ⚠️  ${candidate.firstName} ${candidate.lastName} - Numéro non trouvé`);
        skipped++;
        continue;
      }

      console.log(`${progress} 📄 ${candidate.firstName} ${candidate.lastName} (N°${numero})...`);

      // Lire les détails d'entrevue
      const interviewDetails = await readCandidateSheet(numero, candidate.firstName, candidate.lastName);

      if (interviewDetails && Object.keys(interviewDetails).length > 0) {
        // Mettre à jour le candidat
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: { interviewDetails },
        });

        console.log(`      ✅ ${Object.keys(interviewDetails).length} champs importés`);
        updated++;
      } else {
        console.log(`      ⚠️  Aucun détail trouvé`);
        notFound++;
      }

      // Délai de 1.5 secondes entre chaque requête (40 req/min max)
      if (i < candidates.length - 1) {
        await delay(1500);
      }
    }

    // Résumé
    console.log('\n════════════════════════════════════════');
    console.log('📊 RÉSUMÉ DE LA MISE À JOUR\n');
    console.log(`✅ Candidats mis à jour: ${updated}`);
    console.log(`⚠️  Onglets non trouvés: ${notFound}`);
    console.log(`⚠️  Candidats ignorés (pas de N°): ${skipped}`);
    console.log(`📊 Total traité: ${candidates.length}`);
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
