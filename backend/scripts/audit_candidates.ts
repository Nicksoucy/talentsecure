
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function audit() {
    const all = await prisma.candidate.findMany({
        select: { id: true, firstName: true, lastName: true, phone: true, email: true, createdAt: true, createdById: true }
    });

    console.log(`Total Candidats: ${all.length}`);

    const badPhone = all.filter(c => c.phone === '0000000000' || c.phone === '00000000000' || !c.phone);
    const unknownName = all.filter(c => c.lastName === 'Unknown' || c.firstName === 'Unknown');
    const noEmail = all.filter(c => !c.email);
    const createdToday = all.filter(c => {
        const diff = new Date().getTime() - new Date(c.createdAt).getTime();
        return diff < 24 * 60 * 60 * 1000; // 24h
    });

    console.log(`\n--- Analyse Qualité ---`);
    console.log(`Téléphone "0000000000": ${badPhone.length}`);
    console.log(`Nom "Unknown": ${unknownName.length}`);
    console.log(`Sans Email: ${noEmail.length}`);
    console.log(`Créés aujourd'hui (24h): ${createdToday.length}`);

    console.log(`\n--- Exemples de "Mauvais" Candidats (Créés aujourd'hui) ---`);
    badPhone.filter(c => createdToday.includes(c)).slice(0, 10).forEach(c => {
        console.log(`- ${c.firstName} ${c.lastName} | Tel: ${c.phone} | Email: ${c.email}`);
    });
}

audit().finally(() => prisma.$disconnect());
