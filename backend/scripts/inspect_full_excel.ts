
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

const filePath = process.argv[2];

if (!filePath) {
    process.exit(1);
}

const absolutePath = path.resolve(filePath);
const workbook = XLSX.readFile(absolutePath);

console.log(`\n--- Structure du fichier ---`);
console.log(`Nombre de feuilles : ${workbook.SheetNames.length}`);

workbook.SheetNames.forEach((name, index) => {
    const sheet = workbook.Sheets[name];
    // Calculate range
    const ref = sheet['!ref'];
    let rowCount = 0;
    if (ref) {
        const range = XLSX.utils.decode_range(ref);
        rowCount = range.e.r + 1;
    }

    console.log(`\nFeuille ${index + 1}: "${name}"`);
    console.log(`- Lignes totales (approx): ${rowCount}`);

    // Preview first few rows raw
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log(`- Lignes de données détectées (header:1): ${json.length}`);
});
