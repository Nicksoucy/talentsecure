
import * as XLSX from 'xlsx';
import * as path from 'path';

const filePath = "C:/Recrutement/Grille d'entretiens xguard.security (2).xlsx";
const workbook = XLSX.readFile(filePath);

// Find a candidate sheet (e.g., containing "135" or just pick index 12)
const sheetName = workbook.SheetNames.find(n => n.includes("135")) || workbook.SheetNames[10];

console.log(`--- Inspection de la feuille : "${sheetName}" ---`);

const sheet = workbook.Sheets[sheetName];
const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

// Print first 20 rows to see the form layout
json.slice(0, 20).forEach((row: any, i) => {
    console.log(`Row ${i}:`, JSON.stringify(row));
});
