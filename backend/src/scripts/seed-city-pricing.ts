import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

// Définition des villes du Québec avec leurs tiers de prix
// Tier 1: Grandes villes - Prix standard
// Tier 2: Villes moyennes - Prix standard à légèrement élevé
// Tier 3: Villes éloignées/petites - Prix élevé (prime d'éloignement)

const cityPricingData = [
  // TIER 1 - Grandes villes (Prix standard)
  {
    city: 'Montréal',
    tier: 1,
    evaluatedPrice: 35,
    cvPrice: 8,
    multiplier: 1.0,
  },
  {
    city: 'Québec',
    tier: 1,
    evaluatedPrice: 32,
    cvPrice: 7.50,
    multiplier: 1.0,
  },
  {
    city: 'Laval',
    tier: 1,
    evaluatedPrice: 33,
    cvPrice: 7.75,
    multiplier: 1.0,
  },
  {
    city: 'Gatineau',
    tier: 1,
    evaluatedPrice: 30,
    cvPrice: 7.50,
    multiplier: 1.0,
  },
  {
    city: 'Longueuil',
    tier: 1,
    evaluatedPrice: 33,
    cvPrice: 7.75,
    multiplier: 1.0,
  },
  {
    city: 'Sherbrooke',
    tier: 1,
    evaluatedPrice: 28,
    cvPrice: 7,
    multiplier: 1.0,
  },
  {
    city: 'Lévis',
    tier: 1,
    evaluatedPrice: 30,
    cvPrice: 7.50,
    multiplier: 1.0,
  },
  {
    city: 'Terrebonne',
    tier: 1,
    evaluatedPrice: 32,
    cvPrice: 7.50,
    multiplier: 1.0,
  },
  {
    city: 'Saguenay',
    tier: 1,
    evaluatedPrice: 30,
    cvPrice: 7.25,
    multiplier: 1.05,
  },
  {
    city: 'Trois-Rivières',
    tier: 1,
    evaluatedPrice: 27,
    cvPrice: 6.75,
    multiplier: 1.0,
  },

  // TIER 2 - Villes moyennes (Prix moyen à légèrement élevé)
  {
    city: 'Repentigny',
    tier: 2,
    evaluatedPrice: 30,
    cvPrice: 7.25,
    multiplier: 1.0,
  },
  {
    city: 'Brossard',
    tier: 2,
    evaluatedPrice: 33,
    cvPrice: 7.75,
    multiplier: 1.0,
  },
  {
    city: 'Saint-Jean-sur-Richelieu',
    tier: 2,
    evaluatedPrice: 28,
    cvPrice: 7,
    multiplier: 1.0,
  },
  {
    city: 'Drummondville',
    tier: 2,
    evaluatedPrice: 26,
    cvPrice: 6.50,
    multiplier: 1.0,
  },
  {
    city: 'Saint-Jérôme',
    tier: 2,
    evaluatedPrice: 29,
    cvPrice: 7.25,
    multiplier: 1.0,
  },
  {
    city: 'Granby',
    tier: 2,
    evaluatedPrice: 27,
    cvPrice: 6.75,
    multiplier: 1.0,
  },
  {
    city: 'Blainville',
    tier: 2,
    evaluatedPrice: 31,
    cvPrice: 7.50,
    multiplier: 1.0,
  },
  {
    city: 'Saint-Hyacinthe',
    tier: 2,
    evaluatedPrice: 27,
    cvPrice: 6.75,
    multiplier: 1.0,
  },
  {
    city: 'Shawinigan',
    tier: 2,
    evaluatedPrice: 25,
    cvPrice: 6.25,
    multiplier: 1.05,
  },
  {
    city: 'Dollard-des-Ormeaux',
    tier: 2,
    evaluatedPrice: 32,
    cvPrice: 7.50,
    multiplier: 1.0,
  },
  {
    city: 'Châteauguay',
    tier: 2,
    evaluatedPrice: 29,
    cvPrice: 7.25,
    multiplier: 1.0,
  },
  {
    city: 'Rimouski',
    tier: 2,
    evaluatedPrice: 32,
    cvPrice: 7.75,
    multiplier: 1.15, // Prime d'éloignement
  },
  {
    city: 'Victoriaville',
    tier: 2,
    evaluatedPrice: 26,
    cvPrice: 6.50,
    multiplier: 1.0,
  },
  {
    city: 'Saint-Eustache',
    tier: 2,
    evaluatedPrice: 30,
    cvPrice: 7.25,
    multiplier: 1.0,
  },
  {
    city: 'Mascouche',
    tier: 2,
    evaluatedPrice: 30,
    cvPrice: 7.25,
    multiplier: 1.0,
  },

  // TIER 3 - Villes éloignées/petites (Prix élevé - prime d'éloignement)
  {
    city: 'Rouyn-Noranda',
    tier: 3,
    evaluatedPrice: 38,
    cvPrice: 9,
    multiplier: 1.20, // 20% prime éloignement
  },
  {
    city: 'Val-d\'Or',
    tier: 3,
    evaluatedPrice: 40,
    cvPrice: 9.50,
    multiplier: 1.25, // 25% prime éloignement
  },
  {
    city: 'Sept-Îles',
    tier: 3,
    evaluatedPrice: 42,
    cvPrice: 10,
    multiplier: 1.30, // 30% prime éloignement
  },
  {
    city: 'Alma',
    tier: 3,
    evaluatedPrice: 30,
    cvPrice: 7.50,
    multiplier: 1.10,
  },
  {
    city: 'Thetford Mines',
    tier: 3,
    evaluatedPrice: 28,
    cvPrice: 7,
    multiplier: 1.05,
  },
  {
    city: 'Salaberry-de-Valleyfield',
    tier: 3,
    evaluatedPrice: 27,
    cvPrice: 6.75,
    multiplier: 1.0,
  },
  {
    city: 'Sorel-Tracy',
    tier: 3,
    evaluatedPrice: 26,
    cvPrice: 6.50,
    multiplier: 1.0,
  },
  {
    city: 'Joliette',
    tier: 3,
    evaluatedPrice: 27,
    cvPrice: 6.75,
    multiplier: 1.0,
  },
  {
    city: 'Rivière-du-Loup',
    tier: 3,
    evaluatedPrice: 30,
    cvPrice: 7.50,
    multiplier: 1.10,
  },
  {
    city: 'Vaudreuil-Dorion',
    tier: 3,
    evaluatedPrice: 31,
    cvPrice: 7.50,
    multiplier: 1.0,
  },
  {
    city: 'Magog',
    tier: 3,
    evaluatedPrice: 28,
    cvPrice: 7,
    multiplier: 1.0,
  },
  {
    city: 'La Prairie',
    tier: 3,
    evaluatedPrice: 30,
    cvPrice: 7.25,
    multiplier: 1.0,
  },
  {
    city: 'Sainte-Thérèse',
    tier: 3,
    evaluatedPrice: 30,
    cvPrice: 7.25,
    multiplier: 1.0,
  },
  {
    city: 'Sainte-Julie',
    tier: 3,
    evaluatedPrice: 31,
    cvPrice: 7.50,
    multiplier: 1.0,
  },
  {
    city: 'Mirabel',
    tier: 3,
    evaluatedPrice: 29,
    cvPrice: 7.25,
    multiplier: 1.0,
  },
];

async function seedCityPricing() {
  console.log('🌱 Début du seed des prix par ville...\n');

  try {
    // Supprimer les prix existants
    const deleteResult = await prisma.cityPricing.deleteMany({});
    console.log(`🗑️  ${deleteResult.count} prix existants supprimés\n`);

    // Créer les nouveaux prix
    let created = 0;
    let errors = 0;

    for (const city of cityPricingData) {
      try {
        await prisma.cityPricing.create({
          data: {
            city: city.city,
            province: 'QC',
            evaluatedCandidateMinPrice: new Decimal(15),
            evaluatedCandidateMaxPrice: new Decimal(45),
            evaluatedCandidatePrice: new Decimal(city.evaluatedPrice),
            cvOnlyMinPrice: new Decimal(5),
            cvOnlyMaxPrice: new Decimal(10),
            cvOnlyPrice: new Decimal(city.cvPrice),
            priceMultiplier: new Decimal(city.multiplier),
          },
        });
        created++;
        console.log(
          `✅ ${city.city.padEnd(25)} | Tier ${city.tier} | Évalués: ${city.evaluatedPrice}$ | CVs: ${city.cvPrice}$ | Mult: x${city.multiplier}`
        );
      } catch (error) {
        errors++;
        console.error(`❌ Erreur pour ${city.city}:`, error);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(`\n✅ Seed terminé avec succès!`);
    console.log(`   ${created} villes créées`);
    if (errors > 0) {
      console.log(`   ${errors} erreurs`);
    }
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 Statistiques:');
    console.log(`   Tier 1 (Grandes villes):     ${cityPricingData.filter(c => c.tier === 1).length} villes`);
    console.log(`   Tier 2 (Villes moyennes):    ${cityPricingData.filter(c => c.tier === 2).length} villes`);
    console.log(`   Tier 3 (Villes éloignées):   ${cityPricingData.filter(c => c.tier === 3).length} villes`);
    console.log('\n💰 Fourchettes de prix:');
    console.log(`   Candidats évalués: ${Math.min(...cityPricingData.map(c => c.evaluatedPrice))}$ - ${Math.max(...cityPricingData.map(c => c.evaluatedPrice))}$`);
    console.log(`   CVs seulement:     ${Math.min(...cityPricingData.map(c => c.cvPrice))}$ - ${Math.max(...cityPricingData.map(c => c.cvPrice))}$`);
    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Erreur lors du seed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Exécuter le seed
seedCityPricing()
  .then(() => {
    console.log('✅ Script terminé avec succès');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  });
