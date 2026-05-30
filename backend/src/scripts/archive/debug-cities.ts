import * as XLSX from 'xlsx';
import path from 'path';

async function debugCities() {
  try {
    console.log('📖 Lecture du fichier Excel...');

    const excelPath = path.join('C:', 'Recrutement', "Grille d'entretiens xguard.security (1).xlsx");
    const workbook = XLSX.readFile(excelPath);

    let sheetName = workbook.SheetNames.find(name =>
      name.toLowerCase().includes('récapitulatif') ||
      name.toLowerCase().includes('recapitulatif')
    );

    if (!sheetName) {
      sheetName = workbook.SheetNames[0];
    }

    const worksheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const headers = data[0] as string[];
    const nameCol = 1;
    const emailCol = 2;
    const cityCol = 4;

    console.log(`\n📊 Analyse de toutes les lignes:\n`);

    for (let i = 1; i < Math.min(data.length, 20); i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      const fullName = row[nameCol]?.toString().trim();
      const email = row[emailCol]?.toString().trim();
      const city = row[cityCol];

      console.log(`Ligne ${i + 1}:`);
      console.log(`  Nom: "${fullName}"`);
      console.log(`  Email: "${email}"`);
      console.log(`  Ville (raw): ${JSON.stringify(city)}`);
      console.log(`  Ville type: ${typeof city}`);
      if (city) {
        console.log(`  Ville (trimmed): "${city.toString().trim()}"`);
        console.log(`  Ville length: ${city.toString().trim().length}`);
      }
      console.log('');
    }
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

debugCities();
