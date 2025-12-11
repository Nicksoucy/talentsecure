
import * as XLSX from 'xlsx';
import * as path from 'path';

const filePath = "C:/Recrutement/Grille d'entretiens xguard.security (2).xlsx";
const workbook = XLSX.readFile(filePath);

console.log(`\n--- Analyse des 20 premières feuilles ---`);

workbook.SheetNames.slice(0, 20).forEach((name, index) => {
    const sheet = workbook.Sheets[name];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Get raw array of arrays

    let rowCount = 0;
    let headers: any[] = [];

    if (json.length > 0) {
        rowCount = json.length;
        headers = json[0] as any[];
    }

    console.log(`\nSheet ${index + 1}: "${name}"`);
    console.log(`  - Lignes trouvées: ${rowCount}`);
    console.log(`  - Headers (Raw): ${JSON.stringify(headers)}`);
});
