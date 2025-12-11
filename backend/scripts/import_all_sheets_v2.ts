
import { PrismaClient, CandidateStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

const prisma = new PrismaClient();
const EXCEL_PATH = "C:/Recrutement/Grille d'entretiens xguard.security (2).xlsx";

function normalizePhone(phone: any): string | null {
    if (!phone) return null;
    // Keep only digits
    let p = String(phone).replace(/\D/g, '');
    if (p.length === 0) return null;
    return p;
}

function parseNote(text: string): { rating: number | null, status: CandidateStatus | null } {
    let rating = null;
    let status = null;
    if (!text) return { rating, status };

    const str = String(text).toLowerCase();

    // Status check first
    if (str.includes('absent') || str.includes('no show') || str.includes('pas venu') || str.includes('annulé')) {
        return { rating: null, status: CandidateStatus.ABSENT };
    }

    // Rating extract "6/10", "Note : 8.5", "8,5"
    // Regex to find a number between 0 and 10
    const match = str.match(/([0-9]+[.,]?[0-9]*)\s*(\/|sur)?\s*10/) || str.match(/note\s*[:]\s*([0-9]+[.,]?[0-9]*)/) || str.match(/^([0-9]+[.,]?[0-9]*)$/);

    if (match) {
        const val = parseFloat(match[1].replace(',', '.'));
        if (!isNaN(val) && val <= 10) rating = val;
    }

    // Auto-status
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
    const createdById = systemUser?.id || "import-v2";

    console.log(`Starting Import V2 on ${workbook.SheetNames.length} sheets...`);

    let count = 0;
    let skipped = 0;

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];

        // Helper to find value by scanning column 0 (and maybe others?)
        // We look in first 30 rows
        const findVal = (keys: string[]): string | null => {
            for (let i = 0; i < Math.min(rows.length, 30); i++) {
                const cellA = String(rows[i][0] || "").toLowerCase();
                if (keys.some(k => cellA.includes(k.toLowerCase()))) {
                    // Return Col B (index 1)
                    const val = rows[i][1];
                    if (val) return String(val).trim();
                }
            }
            return null;
        };

        // KEYS
        // Name
        let rawName = findVal(["Identité", "Nom et prénoms", "Nom :"]);
        // Email
        let email = findVal(["Adresse mail", "Courriel", "Email", "Mail"]);
        // Phone
        let phoneStr = findVal(["Contact", "Téléphone", "Tel", "Tél", "Cellulaire"]);
        // Note
        let noteStr = findVal(["Note", "Appréciation Globale", "Avis RH"]);
        // Remarks
        let remarks = findVal(["Remarques", "Commentaires", "Observation"]);

        if (!rawName) {
            // Try fallback: is this sheet named like a candidate? "108.Mamadou..."
            if (sheetName.match(/^\d+\./)) {
                // Maybe name is in the sheetname?
                // "108.Mamadou Madiou" -> "Mamadou Madiou"
                rawName = sheetName.replace(/^\d+\./, '').trim();
                // Try searching broadly for email in the whole sheet?
                // Too risky.
            } else {
                skipped++;
                continue; // Not a candidate sheet
            }
        }

        // Clean Name "Name - Age - Nationality"
        const nameOnly = rawName.split('-')[0].split('(')[0].trim();

        // Parse name pieces
        const parts = nameOnly.split(/\s+/);
        const firstName = parts[0];
        const lastName = parts.slice(1).join(' ') || (parts[0] === nameOnly ? rawName : "Unknown");
        // If only one word, use it as First Name, last name ?

        const cleanPhone = normalizePhone(phoneStr);
        const { rating, status: derivedStatus } = parseNote(noteStr || "");
        const status = derivedStatus || CandidateStatus.EN_ATTENTE;

        const finalEmail = email || undefined;
        const finalPhone = cleanPhone || "0000000000";

        // Upsert
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
                        // Update status only if better? Or overwrite? User wants "correct" status.
                        status: status !== CandidateStatus.EN_ATTENTE ? status : undefined,
                        globalRating: rating || undefined
                    }
                });
                // console.log(`[UPDATED] ${nameOnly}`);
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
                        interviewDetails: { sheetName, rawName, noteStr }
                    }
                });
                // console.log(`[CREATED] ${nameOnly}`);
                count++;
            }
        } catch (e) {
            console.error(`[ERROR] Failed to save ${nameOnly}:`, e);
        }
    }

    console.log(`\n--- TERMINÉ ---`);
    console.log(`Traités : ${count}`);
    console.log(`Ignorés (Pas de fiche détectée) : ${skipped}`);
}

importAll().finally(() => prisma.$disconnect());
