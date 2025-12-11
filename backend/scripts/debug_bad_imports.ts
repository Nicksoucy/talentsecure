
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const bad = await prisma.candidate.findMany({
        where: { phone: '0000000000', createdAt: { gt: new Date(Date.now() - 24 * 3600 * 1000) } },
        take: 5,
        select: { firstName: true, lastName: true, interviewDetails: true }
    });
    console.log(JSON.stringify(bad, null, 2));
}

run().finally(() => prisma.$disconnect());
