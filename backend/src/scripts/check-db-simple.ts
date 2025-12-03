import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const count = await prisma.candidate.count();
        console.log(`Candidates count: ${count}`);
        const userCount = await prisma.user.count();
        console.log(`Users count: ${userCount}`);
    } catch (e) {
        console.error('Error connecting to DB:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
