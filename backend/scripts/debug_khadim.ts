
import * as XLSX from 'xlsx';

const EXCEL_PATH = "C:/Recrutement/Grille d'entretiens xguard.security (2).xlsx";
const workbook = XLSX.readFile(EXCEL_PATH);
const sheetName = workbook.SheetNames.find(n => n.includes("135")) || "";
console.log(`Debugging Sheet: ${sheetName}`);

const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];

const keys = ["Adresse mail", "Courriel", "Email", "Mail"];

console.log("Searching for Email keys:", keys);

for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (!row || !row[0]) {
        console.log(`Row ${i}: [Empty/No Col 0]`, row);
        continue;
    }
    const cellA = String(row[0]).toLowerCase().trim();
    console.log(`Row ${i} Col 0: "${cellA}"`);

    if (keys.some(k => cellA.includes(k.toLowerCase()))) {
        console.log(`   MATCH FOUND at Row ${i}!`);
        for (let j = 1; j < row.length; j++) {
            console.log(`      Col ${j}: "${row[j]}"`);
        }
    }
}
