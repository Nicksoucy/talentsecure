import * as XLSX from 'xlsx';

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

async function findDuplicates() {
  console.log('🔍 Recherche des doublons dans l\'Excel...\n');

  try {
    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const summarySheet = workbook.Sheets['Récapitulatif xguard '];
    const summaryData = XLSX.utils.sheet_to_json(summarySheet) as any[];

    const nameMap = new Map<string, number[]>();

    for (let i = 0; i < summaryData.length; i++) {
      const row = summaryData[i];
      const nomPrenoms = row['Nom & prénoms'];

      if (!nomPrenoms) continue;

      const normalized = normalize(nomPrenoms);

      if (!nameMap.has(normalized)) {
        nameMap.set(normalized, []);
      }
      // Excel rows start at 2 (row 1 is header)
      nameMap.get(normalized)!.push(i + 2);
    }

    // Find duplicates
    const duplicates: Array<{name: string, rows: number[]}> = [];

    for (const [normalized, rows] of nameMap) {
      if (rows.length > 1) {
        // Get the original name from first occurrence
        const firstRow = summaryData[rows[0] - 2];
        duplicates.push({
          name: firstRow['Nom & prénoms'],
          rows: rows
        });
      }
    }

    if (duplicates.length === 0) {
      console.log('✅ Aucun doublon trouvé!');
      return;
    }

    console.log(`🔄 ${duplicates.length} doublon(s) trouvé(s):\n`);
    console.log('='.repeat(80));

    duplicates.forEach((dup, idx) => {
      console.log(`\n${idx + 1}. "${dup.name}"`);
      console.log(`   Lignes Excel: ${dup.rows.join(', ')}`);
      console.log(`   Nombre d'occurrences: ${dup.rows.length}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log(`\n📊 Total candidats uniques: ${nameMap.size}`);
    console.log(`🔄 Total doublons: ${duplicates.length}`);
    console.log(`📋 Total lignes (avec doublons): ${summaryData.filter(r => r['Nom & prénoms']).length}`);

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }
}

findDuplicates();
