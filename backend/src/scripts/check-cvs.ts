import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCVs() {
  console.log('📊 Vérification des CVs dans la base de données...\n');

  try {
    // Compter tous les prospects
    const totalProspects = await prisma.prospectCandidate.count();

    // Compter les prospects avec CV
    const prospectsWithCV = await prisma.prospectCandidate.count({
      where: {
        cvUrl: {
          not: null,
        },
      },
    });

    console.log(`📋 Total prospects: ${totalProspects}`);
    console.log(`📎 Prospects avec CV: ${prospectsWithCV}`);
    console.log(`❌ Prospects sans CV: ${totalProspects - prospectsWithCV}\n`);

    if (prospectsWithCV > 0) {
      console.log('✅ Exemples de prospects avec CV:\n');

      const examples = await prisma.prospectCandidate.findMany({
        where: {
          cvUrl: {
            not: null,
          },
        },
        select: {
          firstName: true,
          lastName: true,
          email: true,
          cvUrl: true,
        },
        take: 5,
      });

      examples.forEach((p, i) => {
        console.log(`${i + 1}. ${p.firstName} ${p.lastName}`);
        console.log(`   Email: ${p.email}`);
        console.log(`   CV: ${p.cvUrl}\n`);
      });
    } else {
      console.log('⚠️ Aucun CV trouvé. Le custom field ID est peut-être incorrect.\n');
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCVs();
