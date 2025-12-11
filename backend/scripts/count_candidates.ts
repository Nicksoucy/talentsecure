
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
    const count = await prisma.candidate.count();
    console.log('Total Candidates in DB:', count);
}
run().finally(() => prisma.$disconnect());
