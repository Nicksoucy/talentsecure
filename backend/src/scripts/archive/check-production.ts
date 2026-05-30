import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkProduction() {
  try {
    console.log('🔍 Vérification de la base de données de production...\n');

    // Check prospects
    const prospectCount = await prisma.prospectCandidate.count();
    console.log(`✅ Table prospect_candidates existe!`);
    console.log(`📊 Nombre de prospects: ${prospectCount}\n`);

    // Check unique cities
    const cities = await prisma.prospectCandidate.groupBy({
      by: ['city'],
      _count: true,
      where: {
        city: { not: null },
        isDeleted: false
      }
    });
    console.log(`🏙️  Nombre de villes uniques: ${cities.length}\n`);

    // Top 5 cities
    const topCities = await prisma.prospectCandidate.groupBy({
      by: ['city'],
      _count: true,
      where: {
        city: { not: null },
        isDeleted: false
      },
      orderBy: {
        _count: {
          city: 'desc'
        }
      },
      take: 5
    });

    console.log('Top 5 villes:');
    topCities.forEach((city, index) => {
      console.log(`${index + 1}. ${city.city}: ${city._count} prospects`);
    });

    // Check candidates
    const candidateCount = await prisma.candidate.count({
      where: { isDeleted: false }
    });
    console.log(`\n👥 Nombre de candidats qualifiés: ${candidateCount}`);

    console.log('\n✅ Base de données prête pour le déploiement!');

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkProduction();
