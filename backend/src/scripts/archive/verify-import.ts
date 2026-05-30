import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyImport() {
  console.log('📊 Vérification de l\'import des candidats...\n');

  try {
    // Total count
    const totalCount = await prisma.candidate.count({
      where: { isDeleted: false },
    });

    console.log(`✅ Total de candidats dans la base: ${totalCount}\n`);

    // Count by status
    const byStatus = await prisma.candidate.groupBy({
      by: ['status'],
      where: { isDeleted: false },
      _count: true,
    });

    console.log('📈 Répartition par statut:');
    console.log('='.repeat(60));
    byStatus.forEach((item) => {
      console.log(`   ${item.status}: ${item._count} candidats`);
    });

    // Count with languages
    const withLanguages = await prisma.candidate.count({
      where: {
        isDeleted: false,
        languages: {
          some: {},
        },
      },
    });

    console.log(`\n📝 Candidats avec langues: ${withLanguages}`);

    // Count with availabilities
    const withAvailabilities = await prisma.candidate.count({
      where: {
        isDeleted: false,
        availabilities: {
          some: {},
        },
      },
    });

    console.log(`📅 Candidats avec disponibilités: ${withAvailabilities}`);

    // Count with BSP
    const withBSP = await prisma.candidate.count({
      where: {
        isDeleted: false,
        hasBSP: true,
      },
    });

    console.log(`🔒 Candidats avec BSP: ${withBSP}`);

    // Count with vehicle
    const withVehicle = await prisma.candidate.count({
      where: {
        isDeleted: false,
        hasVehicle: true,
      },
    });

    console.log(`🚗 Candidats avec véhicule: ${withVehicle}`);

    // Sample candidates
    console.log('\n🔍 Échantillon de candidats:');
    console.log('='.repeat(60));

    const samples = await prisma.candidate.findMany({
      where: { isDeleted: false },
      take: 5,
      orderBy: { globalRating: 'desc' },
      include: {
        languages: true,
        availabilities: true,
      },
    });

    samples.forEach((candidate, idx) => {
      console.log(`\n${idx + 1}. ${candidate.firstName} ${candidate.lastName}`);
      console.log(`   Email: ${candidate.email || 'N/A'}`);
      console.log(`   Téléphone: ${candidate.phone}`);
      console.log(`   Ville: ${candidate.city}`);
      console.log(`   Statut: ${candidate.status}`);
      console.log(`   Note: ${candidate.globalRating ? `${candidate.globalRating}/10` : 'N/A'}`);
      console.log(`   Langues: ${candidate.languages.length}`);
      console.log(`   Disponibilités: ${candidate.availabilities.length}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ Vérification terminée !');

  } catch (error: any) {
    console.error('❌ Erreur lors de la vérification:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyImport();
