import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Villes de la région de Charlevoix et environs de La Malbaie
 * Source: Recherche géographique Québec
 */
const CHARLEVOIX_CITIES = [
    // Charlevoix (région principale)
    { name: 'La Malbaie', province: 'QC', priceMultiplier: 1.0 },
    { name: 'Baie-Saint-Paul', province: 'QC', priceMultiplier: 1.0 },
    { name: 'Clermont', province: 'QC', priceMultiplier: 1.0 },
    { name: 'Saint-Siméon', province: 'QC', priceMultiplier: 1.1 }, // Plus éloigné
    { name: 'Les Éboulements', province: 'QC', priceMultiplier: 1.0 },
    { name: 'Saint-Irénée', province: 'QC', priceMultiplier: 1.0 },
    { name: 'Petite-Rivière-Saint-François', province: 'QC', priceMultiplier: 1.0 },
    { name: 'Saint-Urbain', province: 'QC', priceMultiplier: 1.0 },
    { name: 'Notre-Dame-des-Monts', province: 'QC', priceMultiplier: 1.1 },
    { name: 'Saint-Aimé-des-Lacs', province: 'QC', priceMultiplier: 1.1 },
    { name: 'Saint-Fidèle', province: 'QC', priceMultiplier: 1.0 },
    { name: 'Rivière-Malbaie', province: 'QC', priceMultiplier: 1.0 },

    // Villes proches (Côte-Nord et Saguenay-Lac-Saint-Jean)
    { name: 'Tadoussac', province: 'QC', priceMultiplier: 1.2 }, // Plus éloigné
    { name: 'Forestville', province: 'QC', priceMultiplier: 1.3 },
    { name: 'Baie-Comeau', province: 'QC', priceMultiplier: 1.4 },
    { name: 'Chicoutimi', province: 'QC', priceMultiplier: 1.0 },
    { name: 'Jonquière', province: 'QC', priceMultiplier: 1.0 },
    { name: 'Alma', province: 'QC', priceMultiplier: 1.1 },
    { name: 'La Baie', province: 'QC', priceMultiplier: 1.0 },

    // Capitale-Nationale (proche)
    { name: 'Beaupré', province: 'QC', priceMultiplier: 1.0 },
    { name: 'Sainte-Anne-de-Beaupré', province: 'QC', priceMultiplier: 1.0 },
    { name: 'Château-Richer', province: 'QC', priceMultiplier: 1.0 },
    { name: 'Saint-Tite-des-Caps', province: 'QC', priceMultiplier: 1.0 },
    { name: 'Saint-Ferréol-les-Neiges', province: 'QC', priceMultiplier: 1.0 },
];

async function seedCharleVoixCities() {
    console.log('🌍 Ajout des villes de Charlevoix et environs...\n');

    let added = 0;
    let skipped = 0;

    for (const city of CHARLEVOIX_CITIES) {
        try {
            // Vérifier si la ville existe déjà
            const existing = await prisma.cityPricing.findFirst({
                where: {
                    city: city.name,
                },
            });

            if (existing) {
                console.log(`⏭️  ${city.name} existe déjà`);
                skipped++;
                continue;
            }

            // Ajouter la ville avec les prix par défaut
            await prisma.cityPricing.create({
                data: {
                    city: city.name,
                    province: city.province,
                    priceMultiplier: city.priceMultiplier,
                    // Les autres prix utilisent les valeurs par défaut du schéma
                },
            });

            console.log(`✅ ${city.name} ajoutée (multiplicateur: ${city.priceMultiplier}x)`);
            added++;
        } catch (error) {
            console.error(`❌ Erreur pour ${city.name}:`, error);
        }
    }

    console.log(`\n📊 Résumé:`);
    console.log(`   ✅ ${added} villes ajoutées`);
    console.log(`   ⏭️  ${skipped} villes déjà existantes`);
    console.log(`   📍 Total: ${CHARLEVOIX_CITIES.length} villes traitées\n`);

    console.log('💡 Ces villes apparaîtront maintenant dans les filtres de recherche de candidats.');
}

// Exécuter le script
seedCharleVoixCities()
    .catch((error) => {
        console.error('❌ Erreur:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
