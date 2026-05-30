import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCities() {
  console.log('🔍 Analyse des villes des prospects...\n');

  const prospects = await prisma.prospectCandidate.findMany({
    where: {
      isDeleted: false,
      city: { not: null },
    },
    select: {
      city: true,
    },
  });

  // Group by city and count
  const cityStats: { [key: string]: number } = {};
  prospects.forEach((prospect) => {
    const city = prospect.city || 'N/A';
    cityStats[city] = (cityStats[city] || 0) + 1;
  });

  // Convert to array and sort by count
  const stats = Object.entries(cityStats)
    .filter(([city]) => city !== 'N/A')
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count);

  console.log(`📊 Nombre de villes différentes: ${stats.length}\n`);
  console.log('🏙️  Top 20 villes:\n');

  stats.slice(0, 20).forEach(({ city, count }, index) => {
    console.log(`${(index + 1).toString().padStart(2, ' ')}. ${city.padEnd(30, ' ')} : ${count} prospects`);
  });

  console.log(`\n✅ Total prospects avec ville: ${prospects.length}`);

  await prisma.$disconnect();
}

checkCities()
  .catch((error) => {
    console.error('❌ Erreur:', error);
    process.exit(1);
  });
