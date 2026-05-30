import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function removeDuplicate() {
  try {
    console.log('🧹 Suppression du doublon...\n');

    // Find both candidates with this email
    const duplicates = await prisma.candidate.findMany({
      where: { email: 'touclanidjetoh@gmail.com' },
      orderBy: { createdAt: 'asc' }
    });

    console.log(`Trouvé ${duplicates.length} candidats avec cet email`);

    if (duplicates.length > 1) {
      // Keep the newest one (last in the list), delete the first
      const toDelete = duplicates[0];

      console.log(`\n❌ Suppression: ${toDelete.firstName} ${toDelete.lastName} (créé le ${toDelete.createdAt})`);
      console.log(`✅ Conservation: ${duplicates[1].firstName} ${duplicates[1].lastName} (créé le ${duplicates[1].createdAt})\n`);

      // Delete the duplicate
      await prisma.candidate.delete({
        where: { id: toDelete.id }
      });

      console.log('✅ Doublon supprimé!');
    }

    const total = await prisma.candidate.count();
    console.log(`\n📊 Total de candidats: ${total}`);

  } catch (error) {
    console.error('❌ Erreur:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

removeDuplicate();
