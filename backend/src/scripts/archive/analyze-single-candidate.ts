import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const SPREADSHEET_ID = '1NRGsOHiXc1KtKu0U5WHbQRzgGQlL298Sz83W0U6mi1Q';

async function analyzeSingleCandidate() {
  console.log('📊 Analyse détaillée d\'un onglet candidat...\n');

  const sheets = google.sheets('v4');

  try {
    // Analyze the first candidate sheet in detail
    const sheetName = '1. Jean-Marie NBONDA';

    console.log(`📄 Analyse de l'onglet: "${sheetName}"\n`);

    // Get ALL data from this sheet (columns A to Z, rows 1-100)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1:Z100`,
      key: process.env.GOOGLE_SHEETS_API_KEY,
    });

    const rows = response.data.values || [];

    if (rows.length === 0) {
      console.log('⚠️  Onglet vide\n');
      return;
    }

    console.log(`📊 Total de lignes récupérées: ${rows.length}\n`);
    console.log('═'.repeat(80));
    console.log('\n📋 CONTENU COMPLET DE L\'ONGLET:\n');
    console.log('─'.repeat(80));

    // Display all rows with their structure
    rows.forEach((row, index) => {
      const lineNumber = index + 1;

      // Show each row
      console.log(`\nLigne ${lineNumber}:`);

      if (row.length === 0) {
        console.log('   (ligne vide)');
        return;
      }

      // Display each column in the row
      row.forEach((cell, colIndex) => {
        const colLetter = String.fromCharCode(65 + colIndex); // A, B, C, etc.
        const value = cell || '(vide)';

        // Truncate long values
        const displayValue = value.length > 80 ? value.substring(0, 77) + '...' : value;

        console.log(`   ${colLetter}: ${displayValue}`);
      });

      console.log('   ' + '─'.repeat(76));
    });

    console.log('\n═'.repeat(80));
    console.log('\n✅ Analyse terminée!\n');

    // Summary
    console.log('📌 RÉSUMÉ:');
    console.log(`   - Nombre de lignes: ${rows.length}`);
    console.log(`   - Colonnes max trouvées: ${Math.max(...rows.map(r => r.length))}`);
    console.log('');

  } catch (error: any) {
    console.error('❌ Erreur fatale:', error.message);
    if (error.response?.data) {
      console.error('Détails:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

analyzeSingleCandidate();
