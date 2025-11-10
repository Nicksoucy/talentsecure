import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Map des variations de noms vers le nom normalisé
const cityNormalizations: Record<string, string> = {
  'Montreal': 'Montréal',
  'Montrã©Al': 'Montréal',
  'MONTREAL': 'Montréal',
  'montreal': 'Montréal',

  'Quebec': 'Québec',
  'QUEBEC': 'Québec',
  'quebec': 'Québec',
  'Québec city': 'Québec',

  'LAVAL': 'Laval',
  'laval': 'Laval',

  'GATINEAU': 'Gatineau',
  'gatineau': 'Gatineau',

  'LONGUEUIL': 'Longueuil',
  'longueuil': 'Longueuil',

  'Trois-Rivieres': 'Trois-Rivières',
  'Trois-rivieres': 'Trois-Rivières',
  'TROIS-RIVIERES': 'Trois-Rivières',

  'SHERBROOKE': 'Sherbrooke',
  'sherbrooke': 'Sherbrooke',

  'LEVIS': 'Lévis',
  'Levis': 'Lévis',
  'levis': 'Lévis',
};

async function normalizeCities() {
  console.log('🔄 Normalisation des noms de villes...\n');

  let updated = 0;

  for (const [oldName, newName] of Object.entries(cityNormalizations)) {
    const result = await prisma.prospectCandidate.updateMany({
      where: {
        city: oldName,
      },
      data: {
        city: newName,
      },
    });

    if (result.count > 0) {
      console.log(`✅ "${oldName}" -> "${newName}" : ${result.count} prospects mis à jour`);
      updated += result.count;
    }
  }

  console.log(`\n📊 Total: ${updated} prospects mis à jour`);

  // Afficher les nouvelles stats
  console.log('\n🔍 Vérification des villes après normalisation...\n');

  const prospects = await prisma.prospectCandidate.findMany({
    where: {
      isDeleted: false,
      city: { not: null },
    },
    select: {
      city: true,
    },
  });

  const cityStats: { [key: string]: number } = {};
  prospects.forEach((prospect) => {
    const city = prospect.city || 'N/A';
    cityStats[city] = (cityStats[city] || 0) + 1;
  });

  const stats = Object.entries(cityStats)
    .filter(([city]) => city !== 'N/A')
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count);

  console.log(`📊 Nombre de villes uniques: ${stats.length}\n`);
  console.log('🏙️  Top 15 villes:\n');

  stats.slice(0, 15).forEach(({ city, count }, index) => {
    console.log(`${(index + 1).toString().padStart(2, ' ')}. ${city.padEnd(30, ' ')} : ${count} prospects`);
  });

  await prisma.$disconnect();
}

normalizeCities()
  .catch((error) => {
    console.error('❌ Erreur:', error);
    process.exit(1);
  });
