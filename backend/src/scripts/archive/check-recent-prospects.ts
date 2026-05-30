import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRecent() {
  console.log('\n📋 Les 5 derniers prospects créés:\n');

  const prospects = await prisma.prospectCandidate.findMany({
    where: { isDeleted: false },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      cvUrl: true,
      createdAt: true,
    }
  });

  prospects.forEach((p, i) => {
    console.log(`${i+1}. ${p.firstName} ${p.lastName}`);
    console.log(`   Email: ${p.email}`);
    console.log(`   Tel: ${p.phone}`);
    console.log(`   CV: ${p.cvUrl ? 'Oui ✅' : 'Non ❌'}`);
    console.log(`   Créé: ${p.createdAt}`);
    console.log('');
  });

  await prisma.$disconnect();
}

checkRecent();
