import * as XLSX from 'xlsx';

const EXCEL_FILE_PATH = 'C:\\Recrutement\\Grille d\'entretiens xguard.security (1).xlsx';

async function analyzeSingleSheet() {
  console.log('📊 Analyse d\'une feuille candidat détaillée...\n');

  try {
    const workbook = XLSX.readFile(EXCEL_FILE_PATH);

    // Analyze the first individual candidate sheet (97.Adje Yann)
    const sheetName = '97.Adje Yann';
    console.log(`📄 Analyse de la feuille: ${sheetName}\n`);

    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    console.log('📋 Contenu complet de la feuille:\n');
    console.log('='.repeat(80));

    // Display all rows
    data.forEach((row: any, idx) => {
      if (row && row[0] !== undefined && row[0] !== null && row[0] !== '') {
        const key = row[0];
        const value = row[1] || '';

        // Skip empty rows
        if (key.toString().trim() !== '') {
          console.log(`${key}: ${value}`);
        }
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ Analyse terminée !');

  } catch (error: any) {
    console.error('❌ Erreur lors de l\'analyse:', error.message);
    process.exit(1);
  }
}

analyzeSingleSheet();
