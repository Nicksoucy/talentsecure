import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXCEL_FILE_PATH = 'C:\\Recrutement\\Grille d\'entretiens xguard.security (1).xlsx';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findExactMissing() {
  console.log('🔍 Recherche EXACTE des candidats manquants...\n');

  try {
    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const summarySheet = workbook.Sheets['Récapitulatif xguard '];
    const summaryData = XLSX.utils.sheet_to_json(summarySheet) as any[];

    const allCandidates = await prisma.candidate.findMany({
      where: { isDeleted: false },
      select: { firstName: true, lastName: true }
    });

    console.log(`📊 Excel: ${summaryData.length} lignes`);
    console.log(`📊 Base de données: ${allCandidates.length} candidats\n`);

    // Create set of normalized names from database
    const dbNames = new Set<string>();
    for (const candidate of allCandidates) {
      const fullName = `${candidate.firstName} ${candidate.lastName}`;
      dbNames.add(normalize(fullName));
    }

    console.log(`📊 Noms uniques en base: ${dbNames.size}\n`);

    // Find missing from Excel
    const excelUnique = new Set<string>();
    const missing: any[] = [];
    const excelRows = new Map<string, any>();

    for (const row of summaryData) {
      const nomPrenoms = row['Nom & prénoms'];
      if (!nomPrenoms) continue;

      const normalized = normalize(nomPrenoms);

      if (!excelUnique.has(normalized)) {
        excelUnique.add(normalized);
        excelRows.set(normalized, row);

        if (!dbNames.has(normalized)) {
          console.log(`❌ Manquant: ${nomPrenoms}`);
          missing.push(row);
        }
      }
    }

    console.log(`\n📊 Candidats uniques dans Excel: ${excelUnique.size}`);
    console.log(`❌ Total manquants: ${missing.length}\n`);

    if (missing.length > 0) {
      console.log('Liste des candidats à importer:');
      missing.forEach((row, idx) => {
        console.log(`${idx + 1}. ${row['Nom & prénoms']}`);
      });
    }

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

findExactMissing();
