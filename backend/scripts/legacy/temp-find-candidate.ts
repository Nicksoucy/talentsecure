import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findCandidate() {
  const candidates = await prisma.candidate.findMany({
    take: 5,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      city: true,
      hasBSP: true,
      cvStoragePath: true,
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log('\n=== Candidats disponibles pour test ===');
  candidates.forEach((c, i) => {
    console.log(`${i+1}. ${c.firstName} ${c.lastName} (${c.city})`);
    console.log(`   ID: ${c.id}`);
    console.log(`   BSP: ${c.hasBSP ? 'Oui' : 'Non'}`);
    console.log(`   CV: ${c.cvStoragePath || 'Aucun'}`);
    console.log('');
  });

  if (candidates.length > 0) {
    console.log(`Nous allons tester avec: ${candidates[0].firstName} ${candidates[0].lastName}`);
    console.log(`ID: ${candidates[0].id}`);
  }

  await prisma.$disconnect();
}

findCandidate().catch(e => {
  console.error(e);
  process.exit(1);
});
