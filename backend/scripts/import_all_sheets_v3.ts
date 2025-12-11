
import { PrismaClient, CandidateStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

const prisma = new PrismaClient();
const EXCEL_PATH = "C:/Recrutement/Grille d'entretiens xguard.security (2).xlsx";

function normalizePhone(phone: any): string | null {
    if (!phone) return null;
    let p = String(phone).replace(/\D/g, '');
    if (p.length < 5) return null; // Too short
    return p;
}

function parseNote(text: string): { rating: number | null, status: CandidateStatus | null } {
    let rating = null;
    let status = null;
    if (!text) return { rating, status };

    const str = String(text).toLowerCase();

    if (str.includes('absent') || str.includes('no show') || str.includes('pas venu') || str.includes('annulé') || str.includes('refusé')) {
        return { rating: null, status: CandidateStatus.ABSENT };
    }

    const match = str.match(/([0-9]+[.,]?[0-9]*)\s*(\/|sur)?\s*10/) || str.match(/note\s*[:]\s*([0-9]+[.,]?[0-9]*)/) || str.match(/^([0-9]+[.,]?[0-9]*)$/);

    if (match) {
        const val = parseFloat(match[1].replace(',', '.'));
        if (!isNaN(val) && val <= 10) rating = val;
    }

    if (rating !== null) {
        if (rating >= 9.5) status = CandidateStatus.ELITE;
        else if (rating >= 8.5) status = CandidateStatus.TRES_BON;
        else if (rating >= 8.0) status = CandidateStatus.BON;
        else if (rating >= 7.0) status = CandidateStatus.QUALIFIE;
        else status = CandidateStatus.A_REVOIR;
    }

    return { rating, status };
}

async function importAll() {
    if (!fs.existsSync(EXCEL_PATH)) return;
    const workbook = XLSX.readFile(EXCEL_PATH);
    const systemUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    const createdById = systemUser?.id || "import-v3";

    console.log(`Starting Import V3 on ${workbook.SheetNames.length} sheets...`);
    let count = 0;

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        // Use raw parsing
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];

        // Smarter finder: scan col 0 for keys, find first non-empty value in row
        const findVal = (keys: string[]): string | null => {
            for (let i = 0; i < Math.min(rows.length, 50); i++) {
                const row = rows[i];
                if (!row || !row[0]) continue;
                const cellA = String(row[0]).toLowerCase().trim();
                if (keys.some(k => cellA.includes(k.toLowerCase()))) {
                    // Return first non-empty cell after index 0
                    for (let j = 1; j < row.length; j++) {
                        const v = row[j];
                        if (v && String(v).trim().length > 0) return String(v).trim();
                    }
                }
            }
            return null;
        };

        // Attempt to identify sheet
        let rawName = findVal(["Identité", "Nom et prénoms", "Nom :"]);
        let email = findVal(["Adresse mail", "Courriel", "Email", "Mail"]);
        let phoneStr = findVal(["Contact", "Téléphone", "Tel", "Tél", "Cellulaire"]);
        let noteStr = findVal(["Note", "Appréciation Globale", "Avis RH"]);
        let remarks = findVal(["Remarques", "Commentaires", "Observation"]);

        // If name not found by key, fallback to sheet name if it looks like "123. Name"
        if (!rawName && sheetName.match(/^\d+\./)) {
            rawName = sheetName.replace(/^\d+\./, '').trim();
        }

        if (!rawName) continue; // Skip non-candidate sheets

        const nameOnly = rawName.split('-')[0].split('(')[0].trim();
        const parts = nameOnly.split(/\s+/);
        const firstName = parts[0];
        const lastName = parts.slice(1).join(' ') || (parts[0] === nameOnly ? rawName : "Unknown");

        const cleanPhone = normalizePhone(phoneStr);
        const finalPhone = cleanPhone || "0000000000";

        // Status
        const { rating, status: derivedStatus } = parseNote(noteStr || "");
        const status = derivedStatus || CandidateStatus.EN_ATTENTE;

        // Clean email
        const finalEmail = email && email.includes('@') ? email.trim() : undefined;

        // Log first few to verify
        if (count < 5) {
            console.log(`[PREVIEW] ${nameOnly} | Email: ${finalEmail} | Phone: ${finalPhone} | Note: ${rating}`);
        }

        // Upsert logic
        const existing = await prisma.candidate.findFirst({
            where: {
                OR: [
                    ...(finalEmail ? [{ email: { equals: finalEmail, mode: 'insensitive' as const } }] : []),
                    ...(cleanPhone ? [{ phone: { contains: cleanPhone } }] : [])
                ]
            }
        });

        try {
            if (existing) {
                await prisma.candidate.update({
                    where: { id: existing.id },
                    data: {
                        hrNotes: remarks ? (existing.hrNotes + "\n[Import]: " + remarks) : undefined,
                    }
                });
                count++;
            } else {
                await prisma.candidate.create({
                    data: {
                        firstName,
                        lastName,
                        email: finalEmail,
                        phone: finalPhone,
                        city: "Montréal",
                        status,
                        globalRating: rating,
                        hrNotes: remarks,
                        createdById,
                        interviewDetails: { sheetName, rawName, noteStr, emailFound: finalEmail }
                    }
                });
                count++;
            }
        } catch (e) {
            console.error(`Error saving ${nameOnly}: ${e}`);
        }
    }
    console.log(`\nImported/Updated: ${count}`);
}

importAll().finally(() => prisma.$disconnect());
