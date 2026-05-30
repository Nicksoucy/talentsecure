import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCities() {
  try {
    console.log('🔍 Vérification des villes dans la base de données...\n');

    // Count total candidates
    const totalCandidates = await prisma.candidate.count();
    console.log(`Total de candidats: ${totalCandidates}`);

    // Count candidates with city
    const candidatesWithCity = await prisma.candidate.count({
      where: {
        city: {
          not: null,
          not: ''
        }
      }
    });
    console.log(`Candidats avec ville: ${candidatesWithCity}`);

    // Count candidates without city
    const candidatesWithoutCity = totalCandidates - candidatesWithCity;
    console.log(`Candidats sans ville: ${candidatesWithoutCity}\n`);

    // Show first 10 candidates with cities
    console.log('📋 Exemples de candidats avec ville:\n');
    const examples = await prisma.candidate.findMany({
      where: {
        city: {
          not: null,
          not: ''
        }
      },
      take: 10,
      select: {
        firstName: true,
        lastName: true,
        email: true,
        city: true
      }
    });

    examples.forEach(c => {
      console.log(`- ${c.firstName} ${c.lastName} (${c.email}): ${c.city}`);
    });

    // Group by city
    console.log('\n📊 Répartition par ville:\n');
    const allCandidates = await prisma.candidate.findMany({
      where: {
        city: {
          not: null,
          not: ''
        }
      },
      select: {
        city: true
      }
    });

    const cityCount: { [key: string]: number } = {};
    allCandidates.forEach(c => {
      if (c.city) {
        cityCount[c.city] = (cityCount[c.city] || 0) + 1;
      }
    });

    Object.entries(cityCount)
      .sort((a, b) => b[1] - a[1])
      .forEach(([city, count]) => {
        console.log(`  ${city}: ${count} candidat(s)`);
      });

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCities();
