
import { PrismaClient, CandidateStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

const prisma = new PrismaClient();

// Configuration
const EXCEL_PATH = "C:/Recrutement/Grille d'entretiens xguard.security (2).xlsx";
const CREATED_BY_ID = "system-import"; // We might need a real user ID, finding later

async function importCandidates() {
    console.log(`Chargement du fichier : ${EXCEL_PATH}`);

    if (!fs.existsSync(EXCEL_PATH)) {
        console.error("Fichier introuvable !");
        return;
    }

    const workbook = XLSX.readFile(EXCEL_PATH);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    console.log(`${rows.length} lignes trouvées.`);

    // Find a valid admin/recruiter user for "createdById"
    const adminUser = await prisma.user.findFirst({
        where: { role: { in: ['ADMIN', 'RH_RECRUITER'] } }
    });

    if (!adminUser) {
        console.error("Aucun utilisateur ADMIN ou RH trouvé pour attribuer la création.");
        return;
    }
    const creatorId = adminUser.id;
    console.log(`Créateur par défaut: ${adminUser.email} (${creatorId})`);

    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
        // Mapping Columns (based on inspection)
        // Keys: 'Nom et prénoms ', 'Adresse mail', 'Contact', 'Date de contact', 'RDV RH ', 'Note ', 'Remarques RH '

        // Normalize keys (trim spaces)
        const getVal = (keyPart: string) => {
            const key = Object.keys(row).find(k => k.trim().toLowerCase().includes(keyPart.toLowerCase()));
            return key ? row[key] : null;
        };

        const rawName = getVal('Nom') || '';
        const email = getVal('mail') ? String(getVal('mail')).trim() : null;
        const phone = getVal('Contact') ? String(getVal('Contact')).replace(/\D/g, '') : null; // Keep digits
        const rawNote = getVal('Note');
        const rawRemarks = getVal('Remarques');
        const rawRdv = getVal('RDV');

        // Basic Validation
        if (!rawName || (!email && !phone)) {
            console.warn(`Ligne ignorée (Données manquantes): ${JSON.stringify(row)}`);
            skipped++;
            continue;
        }

        // Split Name
        const nameParts = rawName.trim().split(/\s+/);
        let firstName = nameParts[0];
        let lastName = nameParts.slice(1).join(' ');
        if (!lastName) lastName = "Unknown"; // Fallback

        // Determine Status
        let status: CandidateStatus = CandidateStatus.EN_ATTENTE;
        let notes = rawRemarks ? String(rawRemarks) : '';
        let rating: number | null = null;

        // Is Absent?
        const textToCheck = (notes + " " + String(rawNote || "") + " " + String(rawRdv || "")).toLowerCase();
        if (textToCheck.includes('absent') || textToCheck.includes('pas venu') || textToCheck.includes('no show') || textToCheck.includes('annulé')) {
            status = CandidateStatus.ABSENT;
        }

        // Parse Rating
        if (rawNote) {
            const parsed = parseFloat(String(rawNote));
            if (!isNaN(parsed)) {
                rating = parsed;
                // Auto-Qualify based on rating if not absent
                if (status !== CandidateStatus.ABSENT) {
                    if (parsed >= 9.5) status = CandidateStatus.ELITE;
                    else if (parsed >= 8.5) status = CandidateStatus.TRES_BON;
                    else if (parsed >= 8.0) status = CandidateStatus.BON;
                    else if (parsed >= 7.0) status = CandidateStatus.QUALIFIE;
                    else if (parsed > 0 && parsed < 7.0) status = CandidateStatus.A_REVOIR;
                }
            }
        }

        // Try to find existing candidate
        let existing = null;
        if (email) existing = await prisma.candidate.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
        if (!existing && phone) existing = await prisma.candidate.findFirst({ where: { phone: { contains: phone } } });

        if (existing) {
            // Update logic
            // Only update if we have new meaningful info or just a note?
            // Updating status only if current is EN_ATTENTE or we have a definite new status (like ABSENT)

            const updateData: any = {};
            if (status === CandidateStatus.ABSENT && existing.status !== CandidateStatus.ABSENT) {
                updateData.status = CandidateStatus.ABSENT;
            } else if (rating && !existing.globalRating) {
                updateData.globalRating = rating;
                if (status !== CandidateStatus.EN_ATTENTE && status !== CandidateStatus.ABSENT) updateData.status = status;
            }

            if (rawRemarks) {
                updateData.hrNotes = (existing.hrNotes ? existing.hrNotes + "\n\n[Import]: " : "") + rawRemarks;
            }

            if (Object.keys(updateData).length > 0) {
                await prisma.candidate.update({
                    where: { id: existing.id },
                    data: updateData
                });
                console.log(`[UPDATE] ${firstName} ${lastName} (${email || phone})`);
                updated++;
            } else {
                // console.log(`[SKIP] ${firstName} ${lastName} - Pas de changement majeur`);
                skipped++;
            }

        } else {
            // Create logic
            try {
                await prisma.candidate.create({
                    data: {
                        firstName,
                        lastName,
                        email: email || undefined,
                        phone: phone || "0000000000",
                        city: "Montréal", // Default, not in parsing?
                        status,
                        globalRating: rating,
                        hrNotes: rawRemarks ? String(rawRemarks) : undefined,
                        createdById: creatorId,
                        createdAt: new Date(),
                        interviewDetails: row // Store raw data just in case
                    }
                });
                console.log(`[CREATE] ${firstName} ${lastName} (${status})`);
                added++;
            } catch (e) {
                console.error(`[ERROR] Fail create ${firstName} ${lastName}:`, e);
                skipped++;
            }
        }
    }

    console.log(`\n--- RÉSUMÉ ---`);
    console.log(`Ajoutés : ${added}`);
    console.log(`Mis à jour : ${updated}`);
    console.log(`Ignorés : ${skipped}`);
}

importCandidates()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
