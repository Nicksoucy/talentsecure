import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function removeDuplicates() {
  try {
    console.log('🧹 Suppression des doublons...\n');

    const allCandidates = await prisma.candidate.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`Total de candidats: ${allCandidates.length}\n`);

    const emailGroups: { [key: string]: typeof allCandidates } = {};

    allCandidates.forEach(candidate => {
      const email = (candidate.email || `NO_EMAIL_${candidate.id}`).toLowerCase();
      if (!emailGroups[email]) {
        emailGroups[email] = [];
      }
      emailGroups[email].push(candidate);
    });

    let deletedCount = 0;
    let skippedCount = 0;

    for (const [email, candidates] of Object.entries(emailGroups)) {
      if (candidates.length > 1) {
        const toKeep = candidates[0];
        const toDelete = candidates.slice(1);

        console.log(`\n📧 ${email} (${candidates.length} copies)`);
        console.log(`  ✅ Garder: ${toKeep.firstName} ${toKeep.lastName}`);

        for (const candidate of toDelete) {
          try {
            await prisma.$transaction([
              prisma.candidateLanguage.deleteMany({ where: { candidateId: candidate.id } }),
              prisma.candidateAvailability.deleteMany({ where: { candidateId: candidate.id } }),
              prisma.candidateExperience.deleteMany({ where: { candidateId: candidate.id } }),
              prisma.candidateCertification.deleteMany({ where: { candidateId: candidate.id } }),
              prisma.candidateSituationTest.deleteMany({ where: { candidateId: candidate.id } }),
              prisma.catalogueItem.deleteMany({ where: { candidateId: candidate.id } }),
              prisma.candidate.delete({ where: { id: candidate.id } }),
            ]);

            console.log(`    ❌ Supprimé: ${candidate.firstName} ${candidate.lastName}`);
            deletedCount++;
          } catch (error) {
            console.error(`    ⚠️  Erreur:`, error);
            skippedCount++;
          }
        }
      }
    }

    console.log(`\n✅ Nettoyage terminé!`);
    console.log(`   - ${deletedCount} doublons supprimés`);
    console.log(`   - ${skippedCount} erreurs`);

    const remainingCandidates = await prisma.candidate.count();
    console.log(`   - ${remainingCandidates} candidats restants\n`);

  } catch (error) {
    console.error('❌ Erreur:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

removeDuplicates();
