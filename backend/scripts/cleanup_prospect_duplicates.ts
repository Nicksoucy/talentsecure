
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function cleanup() {
    console.log("Démarrage du nettoyage des doublons Prospects <-> Candidats...");

    const candidates = await prisma.candidate.findMany({
        select: { id: true, email: true, phone: true }
    });

    let processed = 0;

    for (const c of candidates) {
        if (!c.email) continue;

        const duplicates = await prisma.prospectCandidate.findMany({
            where: {
                email: { equals: c.email, mode: 'insensitive' },
                isConverted: false, // Only untouched ones
                isDeleted: false
            }
        });

        for (const p of duplicates) {
            await prisma.prospectCandidate.update({
                where: { id: p.id },
                data: {
                    isConverted: true,
                    convertedToId: c.id,
                    convertedAt: new Date(),
                    isDeleted: true // Also soft delete to hide from basic lists
                }
            });
            console.log(`[CLEANUP] Prospect ${p.email} (ID: ${p.id}) marqué comme converti vers ${c.id}`);
            processed++;
        }
    }

    console.log(`\n--- TERMINÉ ---`);
    console.log(`Prospects nettoyés : ${processed}`);
}

cleanup().finally(() => prisma.$disconnect());
