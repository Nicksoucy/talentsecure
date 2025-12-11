
import * as XLSX from 'xlsx';

const EXCEL_PATH = "C:/Recrutement/Grille d'entretiens xguard.security (2).xlsx";
const workbook = XLSX.readFile(EXCEL_PATH);
const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes("omer")) || "";

console.log(`Scanning sheet: ${sheetName}`);
if (!sheetName) {
    console.log("Sheet not found for Omer");
    process.exit(0);
}

const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

let emailFound = null;
let phoneFound = null;

rows.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
        const s = String(cell);
        if (s.includes('@')) {
            console.log(`Found '@' at [${rIdx}, ${cIdx}]: "${s}"`);
            emailFound = s;
        }
    });
});

if (!emailFound) console.log("No email found in entire sheet.");
