import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkProspectsCVs() {
  const prospects = await prisma.prospectCandidate.findMany({
    where: {
      isDeleted: false,
      isConverted: false
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      cvStoragePath: true
    }
  });

  console.log('=== PROSPECTS AVEC CV ===\n');

  const prospectsWithCV = prospects.filter(p => p.cvStoragePath);

  prospectsWithCV.forEach(p => {
    console.log(`✓ ${p.firstName} ${p.lastName}: ${p.cvStoragePath}`);
  });

  console.log(`\n📊 Total: ${prospectsWithCV.length}/${prospects.length} prospects ont un CV`);
  console.log(`❌ Sans CV: ${prospects.length - prospectsWithCV.length}`);

  await prisma.$disconnect();
}

checkProspectsCVs()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
