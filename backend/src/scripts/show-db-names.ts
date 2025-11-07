import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function showDbNames() {
  console.log('📋 Noms dans la base de données:\n');

  try {
    const candidates = await prisma.candidate.findMany({
      where: { isDeleted: false },
      select: { firstName: true, lastName: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    console.log(`Total: ${candidates.length} premiers candidats:\n`);

    candidates.forEach((c, idx) => {
      console.log(`${idx + 1}. FirstName: "${c.firstName}" | LastName: "${c.lastName}"`);
    });

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

showDbNames();
