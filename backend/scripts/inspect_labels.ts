
import * as XLSX from 'xlsx';
import * as fs from 'fs';

const EXCEL_PATH = "C:/Recrutement/Grille d'entretiens xguard.security (2).xlsx";
const workbook = XLSX.readFile(EXCEL_PATH);

console.log("Analyzing Labels in Column A...");
const labelCounts: Record<string, number> = {};

workbook.SheetNames.slice(0, 50).forEach(name => {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    rows.forEach(row => {
        if (row[0] && typeof row[0] === 'string') {
            const label = row[0].trim();
            if (label.length > 50) return; // Skip long text
            labelCounts[label] = (labelCounts[label] || 0) + 1;
        }
    });
});

console.log(JSON.stringify(labelCounts, null, 2));
