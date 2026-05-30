import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDataCompleteness() {
  console.log('🔍 Vérification de la complétude des données...\n');

  try {
    const total = await prisma.candidate.count({ where: { isDeleted: false } });

    const withEmail = await prisma.candidate.count({
      where: { isDeleted: false, NOT: { email: null } }
    });

    const withPhone = await prisma.candidate.count({
      where: { isDeleted: false, phone: { not: '' } }
    });

    const withGlobalRating = await prisma.candidate.count({
      where: { isDeleted: false, NOT: { globalRating: null } }
    });

    const withHrNotes = await prisma.candidate.count({
      where: { isDeleted: false, NOT: { hrNotes: null } }
    });

    const withVideo = await prisma.candidate.count({
      where: { isDeleted: false, NOT: { videoUrl: null } }
    });

    const withInterviewDate = await prisma.candidate.count({
      where: { isDeleted: false, NOT: { interviewDate: null } }
    });

    console.log('='.repeat(80));
    console.log('📊 COMPLÉTUDE DES DONNÉES');
    console.log('='.repeat(80));
    console.log(`Total candidats: ${total}`);
    console.log(`📧 Avec email: ${withEmail}/${total} (${((withEmail/total)*100).toFixed(1)}%)`);
    console.log(`📱 Avec téléphone: ${withPhone}/${total} (${((withPhone/total)*100).toFixed(1)}%)`);
    console.log(`📊 Avec note globale: ${withGlobalRating}/${total} (${((withGlobalRating/total)*100).toFixed(1)}%)`);
    console.log(`💬 Avec avis RH: ${withHrNotes}/${total} (${((withHrNotes/total)*100).toFixed(1)}%)`);
    console.log(`🎥 Avec vidéo: ${withVideo}/${total} (${((withVideo/total)*100).toFixed(1)}%)`);
    console.log(`📅 Avec date d'entrevue: ${withInterviewDate}/${total} (${((withInterviewDate/total)*100).toFixed(1)}%)`);
    console.log('='.repeat(80));

    // Show some examples without rating
    console.log('\n📋 Exemples sans note globale:');
    const withoutRating = await prisma.candidate.findMany({
      where: { isDeleted: false, globalRating: null },
      take: 10,
      select: { firstName: true, lastName: true, globalRating: true, hrNotes: true }
    });

    withoutRating.forEach((c, idx) => {
      console.log(`${idx + 1}. ${c.firstName} ${c.lastName} - Note: ${c.globalRating || 'AUCUNE'}, Avis: ${c.hrNotes ? 'OUI' : 'NON'}`);
    });

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDataCompleteness();
