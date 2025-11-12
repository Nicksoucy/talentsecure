import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearProspects() {
  console.log('🗑️  Suppression de tous les prospects...\n');

  try {
    const result = await prisma.prospectCandidate.deleteMany({});

    console.log(`✅ ${result.count} prospects supprimés avec succès!`);
    console.log('\n🔄 Vous pouvez maintenant relancer l\'import avec les CVs!\n');

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearProspects();
