import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkProspectCVs() {
  try {
    const prospectsWithCV = await prisma.prospectCandidate.findMany({
      where: {
        cvStoragePath: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        cvStoragePath: true,
        cvUrl: true,
      },
    });

    console.log(`\n📊 Prospects avec CV: ${prospectsWithCV.length}\n`);

    if (prospectsWithCV.length > 0) {
      prospectsWithCV.forEach((prospect, index) => {
        console.log(`${index + 1}. ${prospect.firstName} ${prospect.lastName}`);
        console.log(`   cvStoragePath: ${prospect.cvStoragePath}`);
        console.log(`   cvUrl: ${prospect.cvUrl}\n`);
      });
    } else {
      console.log('Aucun prospect avec CV trouvé.\n');
    }
  } catch (error) {
    console.error('Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProspectCVs();
