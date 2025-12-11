
import * as XLSX from 'xlsx';

const EXCEL_PATH = "C:/Recrutement/Grille d'entretiens xguard.security (2).xlsx";
const workbook = XLSX.readFile(EXCEL_PATH);
const sheetName = workbook.SheetNames.find(n => n.includes("135")) || "";

console.log(`Scanning sheet: ${sheetName}`);
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
        if (s.match(/[0-9]{3}[-. ]?[0-9]{3}[-. ]?[0-9]{4}/)) { // Basic phone regex
            console.log(`Found Phone-like at [${rIdx}, ${cIdx}]: "${s}"`);
            phoneFound = s;
        }
    });
});

if (!emailFound) console.log("No email found in entire sheet.");
if (!phoneFound) console.log("No phone found in entire sheet.");
