import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDates() {
  console.log('🔍 Vérification des dates d\'entrevue...\n');

  try {
    const candidates = await prisma.candidate.findMany({
      where: { isDeleted: false },
      select: {
        firstName: true,
        lastName: true,
        interviewDate: true,
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    console.log('📋 Échantillon de 10 candidats:\n');
    candidates.forEach((candidate, idx) => {
      console.log(`${idx + 1}. ${candidate.firstName} ${candidate.lastName}`);
      console.log(`   Date: ${candidate.interviewDate || 'AUCUNE DATE'}\n`);
    });

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDates();
