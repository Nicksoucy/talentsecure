
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const candidates = await prisma.candidate.findMany({
        select: { id: true, email: true, phone: true, firstName: true, lastName: true }
    });

    const prospects = await prisma.prospectCandidate.findMany({
        where: { isConverted: false, isDeleted: false },
        select: { id: true, email: true, phone: true }
    });

    let emailDups = 0;
    let phoneDups = 0;

    console.log(`--- Vérification ---`);
    console.log(`Candidats Total: ${candidates.length}`);
    console.log(`Prospects (Actifs) Total: ${prospects.length}`);

    for (const c of candidates) {
        if (c.email) {
            const p = prospects.find(p => p.email?.toLowerCase() === c.email?.toLowerCase());
            if (p) {
                console.log(`[DUPLICATE EMAIL] ${c.email} -> Candidat: ${c.firstName} ${c.lastName} | Prospect ID: ${p.id}`);
                emailDups++;
            }
        }
        // Check phone if no email match found (to avoid double counting same person)
        // Actually check both to be thorough
        if (c.phone) {
            // Normalize basic
            const cleanC = c.phone.replace(/\D/g, '');
            const p = prospects.find(p => p.phone && p.phone.replace(/\D/g, '') === cleanC);
            if (p && p.email !== c.email) { // distinct match
                console.log(`[DUPLICATE PHONE] ${c.phone} -> Candidat: ${c.firstName} ${c.lastName} | Prospect ID: ${p.id}`);
                phoneDups++;
            }
        }
    }

    console.log(`\n--- RÉSULTATS ---`);
    console.log(`Doublons par Email: ${emailDups}`);
    console.log(`Doublons par Téléphone (distincts): ${phoneDups}`);
}

check().finally(() => prisma.$disconnect());
