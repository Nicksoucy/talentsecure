import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCandidateDetails() {
  try {
    const candidate = await prisma.candidate.findUnique({
      where: { id: 'd8d43650-c58e-4b33-8485-653059aab5b3' },
      include: {
        situationTests: true,
        languages: true,
      },
    });

    if (!candidate) {
      console.log('❌ Candidat non trouvé');
      return;
    }

    console.log('='.repeat(80));
    console.log('📋 DÉTAILS DU CANDIDAT');
    console.log('='.repeat(80));
    console.log(`Nom: ${candidate.firstName} ${candidate.lastName}`);
    console.log(`Email: ${candidate.email || 'N/A'}`);
    console.log(`Note globale: ${candidate.globalRating || 'N/A'}/10`);

    console.log('\n' + '='.repeat(80));
    console.log('📝 NOTES RH');
    console.log('='.repeat(80));
    console.log(candidate.hrNotes || 'Aucune note');

    console.log('\n' + '='.repeat(80));
    console.log('🎯 TESTS DE SITUATION');
    console.log('='.repeat(80));
    console.log(`Nombre de tests: ${candidate.situationTests.length}`);

    if (candidate.situationTests.length > 0) {
      candidate.situationTests.forEach((test, idx) => {
        console.log(`\n${idx + 1}. Question: ${test.question}`);
        console.log(`   Réponse: ${test.answer}`);
        if (test.rating) console.log(`   Note: ${test.rating}/10`);
        if (test.evaluatorNotes) console.log(`   Notes évaluateur: ${test.evaluatorNotes}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('🗣️ LANGUES');
    console.log('='.repeat(80));
    console.log(`Nombre de langues: ${candidate.languages.length}`);

    if (candidate.languages.length > 0) {
      candidate.languages.forEach(lang => {
        console.log(`- ${lang.language}: ${lang.level}`);
      });
    }

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkCandidateDetails();
