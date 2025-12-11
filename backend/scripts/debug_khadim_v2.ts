
import * as XLSX from 'xlsx';

const EXCEL_PATH = "C:/Recrutement/Grille d'entretiens xguard.security (2).xlsx";
const workbook = XLSX.readFile(EXCEL_PATH);
const sheetName = workbook.SheetNames.find(n => n.includes("135")) || "";

const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];

console.log(`Sheet: ${sheetName}`);
for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i];
    if (row && row[0]) {
        console.log(`R${i}: ${JSON.stringify(row)}`);
    } else {
        // console.log(`R${i}: [Empty]`);
    }
}
