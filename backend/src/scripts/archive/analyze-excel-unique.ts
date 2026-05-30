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

async function analyzeExcel() {
  console.log('📊 Analyse de l\'Excel pour candidats uniques...\n');

  try {
    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const summarySheet = workbook.Sheets['Récapitulatif xguard '];
    const summaryData = XLSX.utils.sheet_to_json(summarySheet) as any[];

    console.log(`Total lignes dans Excel: ${summaryData.length}\n`);

    const uniqueNames = new Set<string>();
    const duplicates: string[] = [];

    for (const row of summaryData) {
      const nomPrenoms = row['Nom & prénoms'];
      if (!nomPrenoms) continue;

      const normalized = normalize(nomPrenoms);

      if (uniqueNames.has(normalized)) {
        duplicates.push(nomPrenoms);
      } else {
        uniqueNames.add(normalized);
      }
    }

    console.log('='.repeat(80));
    console.log(`📊 Total candidats uniques: ${uniqueNames.size}`);
    console.log(`🔄 Doublons trouvés: ${duplicates.length}`);
    console.log('='.repeat(80));

    if (duplicates.length > 0) {
      console.log('\n🔄 Liste des doublons dans Excel:');
      duplicates.forEach((name, idx) => {
        console.log(`${idx + 1}. ${name}`);
      });
    }

    console.log(`\n✅ Nombre de candidats uniques attendu: ${uniqueNames.size}`);

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }
}

analyzeExcel();
