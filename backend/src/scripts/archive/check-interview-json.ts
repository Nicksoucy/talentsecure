import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkInterviewJSON() {
  try {
    const candidate = await prisma.candidate.findUnique({
      where: { id: 'd8d43650-c58e-4b33-8485-653059aab5b3' },
      select: {
        firstName: true,
        lastName: true,
        interviewDetails: true
      },
    });

    if (!candidate) {
      console.log('❌ Candidat non trouvé');
      return;
    }

    console.log('='.repeat(80));
    console.log(`📋 DÉTAILS D'ENTRETIEN: ${candidate.firstName} ${candidate.lastName}`);
    console.log('='.repeat(80));

    if (candidate.interviewDetails) {
      console.log(JSON.stringify(candidate.interviewDetails, null, 2));
    } else {
      console.log('❌ Aucun détail d\'entretien importé');
    }

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkInterviewJSON();
