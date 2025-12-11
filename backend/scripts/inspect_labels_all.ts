
import * as XLSX from 'xlsx';

const EXCEL_PATH = "C:/Recrutement/Grille d'entretiens xguard.security (2).xlsx";
const workbook = XLSX.readFile(EXCEL_PATH);

console.log(`Analyzing Labels in Column A across ALL ${workbook.SheetNames.length} sheets...`);
const labelCounts: Record<string, number> = {};

workbook.SheetNames.forEach(name => {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    rows.forEach(row => {
        if (row[0] && typeof row[0] === 'string') {
            const label = row[0].trim();
            if (label.length > 50) return;
            labelCounts[label] = (labelCounts[label] || 0) + 1;
        }
    });
});

// Sort by frequency
const sorted = Object.entries(labelCounts).sort((a, b) => b[1] - a[1]);
console.log(JSON.stringify(sorted.slice(0, 50), null, 2));
