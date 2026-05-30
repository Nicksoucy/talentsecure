import * as XLSX from 'xlsx';
import * as path from 'path';

const EXCEL_FILE_PATH = 'C:\\Recrutement\\Grille d\'entretiens xguard.security (1).xlsx';

async function analyzeExcelFile() {
  console.log('📊 Analyse du fichier Excel...\n');

  try {
    // Read the Excel file
    const workbook = XLSX.readFile(EXCEL_FILE_PATH);

    console.log('📁 Feuilles trouvées:', workbook.SheetNames);
    console.log('');

    // Analyze each sheet
    workbook.SheetNames.forEach((sheetName, index) => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📄 Feuille ${index + 1}: ${sheetName}`);
      console.log('='.repeat(60));

      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (data.length === 0) {
        console.log('⚠️  Feuille vide');
        return;
      }

      // Display headers (first row)
      const headers = data[0] as any[];
      console.log('\n📋 Colonnes détectées:');
      headers.forEach((header, idx) => {
        console.log(`   ${idx + 1}. ${header || '(vide)'}`);
      });

      // Display number of rows
      console.log(`\n📊 Nombre total de lignes: ${data.length - 1} (hors en-tête)`);

      // Display first 3 rows as sample
      console.log('\n🔍 Aperçu des 3 premières lignes:');
      const sampleData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }).slice(1, 4);
      sampleData.forEach((row: any, idx) => {
        console.log(`\n   Ligne ${idx + 1}:`);
        headers.forEach((header, colIdx) => {
          const value = row[colIdx];
          if (value !== undefined && value !== null && value !== '') {
            console.log(`      ${header}: ${value}`);
          }
        });
      });
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ Analyse terminée !');

  } catch (error: any) {
    console.error('❌ Erreur lors de l\'analyse:', error.message);
    process.exit(1);
  }
}

analyzeExcelFile();
