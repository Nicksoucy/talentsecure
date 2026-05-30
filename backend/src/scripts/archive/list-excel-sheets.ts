import * as XLSX from 'xlsx';

const EXCEL_FILE_PATH = 'C:\\Recrutement\\Grille d\'entretiens xguard.security (1).xlsx';

async function listExcelSheets() {
  try {
    const workbook = XLSX.readFile(EXCEL_FILE_PATH);

    console.log('='.repeat(80));
    console.log('📊 ONGLETS DISPONIBLES DANS L\'EXCEL');
    console.log('='.repeat(80));

    workbook.SheetNames.forEach((sheetName, idx) => {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);

      console.log(`\n${idx + 1}. "${sheetName}"`);
      console.log(`   Nombre de lignes: ${data.length}`);

      // Show first row keys if available
      if (data.length > 0) {
        const firstRow: any = data[0];
        const columns = Object.keys(firstRow);
        console.log(`   Nombre de colonnes: ${columns.length}`);
        console.log(`   Colonnes: ${columns.slice(0, 5).join(', ')}${columns.length > 5 ? '...' : ''}`);
      }
    });

    console.log('\n' + '='.repeat(80));

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }
}

listExcelSheets();
