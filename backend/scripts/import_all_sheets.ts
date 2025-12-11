
import { PrismaClient, CandidateStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

const prisma = new PrismaClient();
const EXCEL_PATH = "C:/Recrutement/Grille d'entretiens xguard.security (2).xlsx";

// Helpers
function normalizePhone(phone: any): string | null {
    if (!phone) return null;
    return String(phone).replace(/\D/g, '');
}

function parseNote(text: string): { rating: number | null, status: CandidateStatus | null } {
    let rating = null;
    let status = null;

    if (!text) return { rating, status };
    const str = String(text).toLowerCase();

    // Detect Rating "Note : 8.5" or just "8.5"
    const noteMatch = str.match(/note\s*[:]\s*([\d,.]+)/) || str.match(/^([\d,.]+)$/);
    if (noteMatch) {
        const val = parseFloat(noteMatch[1].replace(',', '.'));
        if (!isNaN(val)) rating = val;
    }

    // Detect Status keywords
    if (str.includes('absent') || str.includes('no show') || str.includes('pas venu')) status = CandidateStatus.ABSENT;
    else if (rating) {
        if (rating >= 9.5) status = CandidateStatus.ELITE;
        else if (rating >= 8.5) status = CandidateStatus.TRES_BON;
        else if (rating >= 8.0) status = CandidateStatus.BON;
        else if (rating >= 7.0) status = CandidateStatus.QUALIFIE;
        else status = CandidateStatus.A_REVOIR;
    }

    return { rating, status };
}

async function importAll() {
    if (!fs.existsSync(EXCEL_PATH)) {
        console.error("Fichier introuvable.");
        return;
    }

    console.log("Lecture du fichier...");
    const workbook = XLSX.readFile(EXCEL_PATH);

    const systemUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    const createdById = systemUser?.id || "import-script";

    let totalImported = 0;
    let totalSkipped = 0;

    for (const sheetName of workbook.SheetNames) {
        // Skip if it looks like a summary page or instructions
        // We assume candidate sheets start with a number or have specific format
        // But user said "135.FORMATION..." so they seem to have numbers.
        // Let's just try to parse every sheet and see if it has the "Identité" field.

        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];

        // Search for keys in first column
        const getRowVal = (keyPart: string): string | null => {
            const row = rows.find(r => r[0] && String(r[0]).toLowerCase().includes(keyPart.toLowerCase()));
            return row && row[1] ? String(row[1]).trim() : null;
        };

        const nameVal = getRowVal("Identité");
        if (!nameVal) {
            // Not a candidate sheet
            continue;
        }

        // Name often includes Age/Nationality e.g. "Khadim Faye - 30 ans - Sénégalais"
        // We verify against "Nom et prénoms" if available, or split by dash
        const cleanName = nameVal.split('-')[0].trim();
        if (!cleanName) continue;

        const email = getRowVal("Courriel") || getRowVal("Adresse mail");
        const phone = normalizePhone(getRowVal("Téléphone") || getRowVal("Tel") || getRowVal("Contact"));
        const noteText = getRowVal("Appréciation Globale") || getRowVal("Note");

        // Additional: "Remarques"
        const remarks = getRowVal("Remarques") || getRowVal("Commentaires");

        // Parse logic
        const { rating, status: derivedStatus } = parseNote(noteText || "");
        const status = derivedStatus || CandidateStatus.EN_ATTENTE;

        const nameParts = cleanName.split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || "Unknown";

        // Upsert
        const existing = await prisma.candidate.findFirst({
            where: {
                OR: [
                    { email: email || "nomatch@nomatch" },
                    { phone: phone || "00000000000" }
                ]
            }
        });

        if (existing) {
            // Update if needed
            console.log(`[UPDATE] ${cleanName} (Sheet: ${sheetName})`);
            await prisma.candidate.update({
                where: { id: existing.id },
                data: {
                    // globalRating: rating || existing.globalRating, // Only update if valid
                    hrNotes: remarks ? (existing.hrNotes + "\n[Import]: " + remarks) : existing.hrNotes
                }
            });
            totalImported++; // Count as processed
        } else {
            console.log(`[CREATE] ${cleanName} (Sheet: ${sheetName}) - Note: ${rating}`);
            await prisma.candidate.create({
                data: {
                    firstName,
                    lastName,
                    email,
                    phone: phone || "0000000000",
                    city: "Montréal",
                    status,
                    globalRating: rating,
                    hrNotes: remarks,
                    createdById,
                    interviewDetails: { sheetName, rawNote: noteText }
                }
            });
            totalImported++;
        }
    }

    console.log(`\n\n--- TERMINE ---`);
    console.log(`Totale traitées : ${totalImported}`);
}

importAll()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
