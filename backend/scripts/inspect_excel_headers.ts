
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

const filePath = process.argv[2];

if (!filePath) {
    console.error("Veuillez fournir le chemin du fichier Excel en argument.");
    process.exit(1);
}

const absolutePath = path.resolve(filePath);

if (!fs.existsSync(absolutePath)) {
    console.error(`Fichier introuvable : ${absolutePath}`);
    process.exit(1);
}

try {
    const workbook = XLSX.readFile(absolutePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert first row to JSON to get headers
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (data.length > 0) {
        console.log("--- En-têtes trouvés ---");
        console.log(data[0]);
        console.log("\n--- Aperçu de la première ligne de données ---");
        console.log(data[1]);
    } else {
        console.log("Fichier vide ou illisible.");
    }
} catch (error) {
    console.error("Erreur lors de la lecture du fichier:", error);
}
