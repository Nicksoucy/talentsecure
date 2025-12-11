
import * as XLSX from 'xlsx';
import * as path from 'path';

const filePath = "C:/Recrutement/Grille d'entretiens xguard.security (2).xlsx";
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames.find(n => n.includes("135")) || workbook.SheetNames[0];

console.log(`--- DETAIL: "${sheetName}" ---`);

const sheet = workbook.Sheets[sheetName];
const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

// Print rows 0-15, columns 0-5
json.slice(0, 15).forEach((row: any, i) => {
    console.log(`R${i}: ${JSON.stringify(row.slice(0, 5))}`);
});
