import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const SPREADSHEET_ID = '1NRGsOHiXc1KtKu0U5WHbQRzgGQlL298Sz83W0U6mi1Q';

async function analyzeSheet() {
  console.log('📊 Analyse du Google Sheet des candidats...\n');

  const sheets = google.sheets('v4');

  try {
    // 1. Get spreadsheet metadata (list of sheets/tabs)
    console.log('1️⃣ Récupération des onglets...\n');
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      key: process.env.GOOGLE_SHEETS_API_KEY,
    });

    console.log(`📋 Titre du document: ${metadata.data.properties?.title}\n`);
    console.log('📑 Onglets disponibles:\n');

    const sheetList = metadata.data.sheets || [];
    sheetList.forEach((sheet, index) => {
      const title = sheet.properties?.title;
      const sheetId = sheet.properties?.sheetId;
      const rowCount = sheet.properties?.gridProperties?.rowCount;
      const colCount = sheet.properties?.gridProperties?.columnCount;

      console.log(`   ${index + 1}. "${title}"`);
      console.log(`      - ID: ${sheetId}`);
      console.log(`      - Dimensions: ${rowCount} lignes x ${colCount} colonnes`);
      console.log('');
    });

    // 2. For each sheet, get the first few rows to see the structure
    console.log('\n2️⃣ Analyse de la structure de chaque onglet...\n');
    console.log('═'.repeat(80));

    for (const sheet of sheetList) {
      const sheetTitle = sheet.properties?.title;
      console.log(`\n📄 ONGLET: "${sheetTitle}"\n`);

      try {
        // Get first 5 rows
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheetTitle}!A1:Z5`, // First 5 rows, up to column Z
          key: process.env.GOOGLE_SHEETS_API_KEY,
        });

        const rows = response.data.values || [];

        if (rows.length === 0) {
          console.log('   ⚠️  Onglet vide\n');
          continue;
        }

        // Show headers (first row)
        console.log('   📌 EN-TÊTES (ligne 1):');
        const headers = rows[0] || [];
        headers.forEach((header, i) => {
          const colLetter = String.fromCharCode(65 + i); // A, B, C, etc.
          console.log(`      ${colLetter}. ${header || '(vide)'}`);
        });

        console.log(`\n   📊 Nombre de colonnes: ${headers.length}`);
        console.log(`   📊 Lignes échantillon récupérées: ${rows.length}`);

        // Show sample data (rows 2-5)
        if (rows.length > 1) {
          console.log('\n   🔍 ÉCHANTILLON DE DONNÉES (lignes 2-5):\n');
          for (let i = 1; i < Math.min(rows.length, 5); i++) {
            console.log(`      Ligne ${i + 1}:`);
            const row = rows[i];
            headers.forEach((header, colIndex) => {
              const value = row[colIndex] || '(vide)';
              const truncated = value.length > 50 ? value.substring(0, 47) + '...' : value;
              console.log(`         ${header}: ${truncated}`);
            });
            console.log('');
          }
        }

        console.log('   ' + '─'.repeat(76));

      } catch (error: any) {
        console.log(`   ❌ Erreur lors de la lecture: ${error.message}\n`);
      }
    }

    console.log('\n═'.repeat(80));
    console.log('\n✅ Analyse terminée!\n');

  } catch (error: any) {
    console.error('❌ Erreur fatale:', error.message);
    if (error.response?.data) {
      console.error('Détails:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

analyzeSheet();
