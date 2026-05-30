import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { findMatchingCandidate, findMatchingEmployee } from '../utils/candidateMatch';

const prisma = new PrismaClient();

// Chemin vers le fichier CSV
const CSV_FILE_PATH = path.join('C:', 'Recrutement', 'Candidat potentiel', 'Candicat potentiel complet.csv');

interface ProspectRow {
  'Prénom': string;
  'Nom de famille ': string;
  'Téléphone': string;
  'Street Address': string;
  'City': string;
  'Postal code': string;
  'State': string;
  'Courriel': string;
  'Address': string;
  'Country': string;
  'Svp joindre votre CV': string;
  'Timezone': string;
  'Submission Date': string;
}

// Fonction pour nettoyer le téléphone
function cleanPhone(phone: string): string {
  if (!phone) return '';
  // Enlever les +1, espaces, tirets, parenthèses
  return phone.replace(/[\s\-\(\)\+]/g, '');
}

// Fonction pour parser la date de soumission
function parseSubmissionDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    // Format: "Nov 10th 2025, 8:43 am"
    const cleanedDate = dateStr
      .replace(/(\d+)(st|nd|rd|th)/, '$1')  // Enlever st, nd, rd, th
      .replace(',', '');                      // Enlever virgules

    return new Date(cleanedDate);
  } catch (error) {
    console.error(`Erreur parsing date: ${dateStr}`, error);
    return null;
  }
}

// Fonction pour extraire la ville depuis l'adresse
function extractCity(city: string, address: string, state: string): string | null {
  if (city && city.trim()) return city.trim();

  // Essayer d'extraire depuis l'adresse complète
  if (address) {
    const parts = address.split(',');
    if (parts.length >= 2) {
      return parts[parts.length - 2].trim().replace(/\s+(QC|Quebec|Québec).*/i, '');
    }
  }

  return null;
}

async function importProspects() {
  console.log('📖 Import des candidats potentiels depuis CSV...\n');

  // Vérifier que le fichier existe
  if (!fs.existsSync(CSV_FILE_PATH)) {
    console.error(`❌ Fichier CSV non trouvé: ${CSV_FILE_PATH}`);
    process.exit(1);
  }

  // Lire le fichier CSV
  const fileContent = fs.readFileSync(CSV_FILE_PATH, 'utf-8');

  // Parser le CSV
  const records: ProspectRow[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true, // Support UTF-8 BOM
  });

  console.log(`📊 Total de lignes dans le CSV: ${records.length}\n`);

  // Dédoublonner par email + téléphone
  const uniqueProspects = new Map<string, ProspectRow>();
  let duplicatesRemoved = 0;

  for (const record of records) {
    const email = record['Courriel']?.trim().toLowerCase() || '';
    const phone = cleanPhone(record['Téléphone']);

    // Créer une clé unique basée sur email OU téléphone
    const key = email || phone;

    if (!key || key === '') {
      console.log(`⚠️  Ligne ignorée: pas d'email ni de téléphone valide`);
      continue;
    }

    if (uniqueProspects.has(key)) {
      duplicatesRemoved++;
      console.log(`🔄 Doublon détecté: ${record['Prénom']} ${record['Nom de famille ']} (${email || phone})`);
    } else {
      uniqueProspects.set(key, record);
    }
  }

  console.log(`\n✅ Après dédoublonnage: ${uniqueProspects.size} candidats uniques`);
  console.log(`❌ Doublons supprimés: ${duplicatesRemoved}\n`);

  // Importer dans la base de données
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const [key, record] of uniqueProspects) {
    try {
      const firstName = record['Prénom']?.trim();
      const lastName = record['Nom de famille ']?.trim();
      const email = record['Courriel']?.trim().toLowerCase() || null;
      const phone = record['Téléphone']?.trim();

      if (!firstName || !lastName || !phone) {
        console.log(`⚠️  Ignoré: ${firstName} ${lastName} - Données incomplètes`);
        skipped++;
        continue;
      }

      const city = extractCity(
        record['City'],
        record['Address'],
        record['State']
      );

      // Vérifier si déjà existe dans la base
      const existing = await prisma.prospectCandidate.findFirst({
        where: {
          OR: [
            email ? { email } : {},
            { phone: cleanPhone(phone) },
          ],
        },
      });

      if (existing) {
        console.log(`⏭️  Déjà dans la base: ${firstName} ${lastName}`);
        skipped++;
        continue;
      }

      // L'EMPLOYÉ / LE CANDIDAT GAGNENT : ne jamais (re)créer un prospect pour
      // quelqu'un qui est déjà Employé ou Candidat.
      const matchingEmployee = await findMatchingEmployee(prisma, email, cleanPhone(phone));
      if (matchingEmployee) {
        console.log(`⏭️  Déjà EMPLOYÉ, ignoré: ${firstName} ${lastName}`);
        skipped++;
        continue;
      }
      const matchingCandidate = await findMatchingCandidate(prisma, email, cleanPhone(phone));
      if (matchingCandidate) {
        console.log(`⏭️  Déjà CANDIDAT, ignoré: ${firstName} ${lastName}`);
        skipped++;
        continue;
      }

      // Créer le prospect
      await prisma.prospectCandidate.create({
        data: {
          firstName,
          lastName,
          email,
          phone: cleanPhone(phone),
          streetAddress: record['Street Address']?.trim() || null,
          city,
          province: record['State']?.trim() || 'QC',
          postalCode: record['Postal code']?.trim() || null,
          country: record['Country']?.trim() || 'CA',
          fullAddress: record['Address']?.trim() || null,
          cvUrl: record['Svp joindre votre CV']?.trim() || null,
          timezone: record['Timezone']?.trim() || null,
          submissionDate: parseSubmissionDate(record['Submission Date']),
        },
      });

      console.log(`✅ Importé: ${firstName} ${lastName} - ${city || 'Ville inconnue'}`);
      imported++;

    } catch (error: any) {
      console.error(`❌ Erreur: ${record['Prénom']} ${record['Nom de famille ']}`, error.message);
      errors++;
    }
  }

  console.log(`\n
═══════════════════════════════════
  📊 RÉSUMÉ DE L'IMPORT
═══════════════════════════════════
  ✅ Importés: ${imported}
  ⏭️  Déjà existants: ${skipped}
  ❌ Erreurs: ${errors}
  🔄 Doublons supprimés: ${duplicatesRemoved}
═══════════════════════════════════\n`);

  await prisma.$disconnect();
}

// Exécuter l'import
importProspects()
  .catch((error) => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  });
