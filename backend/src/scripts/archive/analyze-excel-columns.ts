import * as XLSX from 'xlsx';

const EXCEL_FILE_PATH = 'C:\\Recrutement\\Grille d\'entretiens xguard.security (1).xlsx';

async function analyzeExcelColumns() {
  console.log('📊 Analyse des colonnes de l\'Excel...\n');

  try {
    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const summarySheet = workbook.Sheets['Récapitulatif xguard '];
    const summaryData = XLSX.utils.sheet_to_json(summarySheet) as any[];

    if (summaryData.length === 0) {
      console.log('❌ Aucune donnée trouvée');
      return;
    }

    // Get first row to analyze columns
    const firstRow = summaryData[0];
    const columns = Object.keys(firstRow);

    console.log('='.repeat(80));
    console.log(`Total colonnes: ${columns.length}`);
    console.log('='.repeat(80));

    columns.forEach((col, idx) => {
      console.log(`${idx + 1}. "${col}"`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('📋 EXEMPLE DE DONNÉES POUR UN CANDIDAT');
    console.log('='.repeat(80));

    // Find candidate Ousmane Sow
    const ousmane = summaryData.find(row =>
      row['Nom & prénoms']?.includes('Ousmane')
    );

    if (ousmane) {
      console.log('\nCandidat: Ousmane Sow');
      console.log('-'.repeat(80));
      Object.entries(ousmane).forEach(([key, value]) => {
        if (value && String(value).trim()) {
          console.log(`\n📌 ${key}:`);
          console.log(`   ${value}`);
        }
      });
    }

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }
}

analyzeExcelColumns();
