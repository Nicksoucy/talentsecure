import * as XLSX from 'xlsx';

const EXCEL_FILE_PATH = 'C:\\Recrutement\\Grille d\'entretiens xguard.security (1).xlsx';

async function analyzeOusmaneSheet() {
  try {
    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const ousmaneSheet = workbook.Sheets['81.Ousmane Sow'];

    if (!ousmaneSheet) {
      console.log('❌ Onglet Ousmane Sow non trouvé');
      return;
    }

    // Convert to JSON without headers to see raw structure
    const rawData = XLSX.utils.sheet_to_json(ousmaneSheet, { header: 1 }) as any[][];

    console.log('='.repeat(80));
    console.log('📋 CONTENU COMPLET DE L\'ONGLET OUSMANE SOW');
    console.log('='.repeat(80));
    console.log(`Nombre de lignes: ${rawData.length}\n`);

    rawData.forEach((row, idx) => {
      // Skip completely empty rows
      if (row.length === 0 || row.every(cell => !cell)) return;

      console.log(`Ligne ${idx + 1}:`);
      row.forEach((cell, cellIdx) => {
        if (cell) {
          console.log(`  [Colonne ${cellIdx}]: ${cell}`);
        }
      });
      console.log('');
    });

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }
}

analyzeOusmaneSheet();
