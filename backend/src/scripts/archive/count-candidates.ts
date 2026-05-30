import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function countCandidates() {
  const total = await prisma.candidate.count({ where: { isDeleted: false } });
  console.log(`Total candidats dans la base: ${total}`);

  const withDates = await prisma.candidate.count({
    where: {
      isDeleted: false,
      interviewDate: { not: null }
    }
  });
  console.log(`Candidats avec date d'entrevue: ${withDates}`);

  await prisma.$disconnect();
}

countCandidates();
