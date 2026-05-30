import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Normalise une chaîne pour la comparaison (enlève accents, minuscules, espaces)
 */
function normalizeString(str: string): string {
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Enlever les accents
        .replace(/[^a-z0-9]/g, '') // Garder seulement lettres et chiffres
        .trim();
}

/**
 * Calcule la distance de Levenshtein entre deux chaînes
 */
function levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }

    return matrix[str2.length][str1.length];
}

/**
 * UNIQUEMENT les villes de Charlevoix proche (< 1h de La Malbaie)
 * EXCLUT: Chicoutimi, Jonquière, Alma, La Baie, Tadoussac, Forestville, Baie-Comeau
 */
const CHARLEVOIX_PROCHE_CITIES = [
    'La Malbaie', 'Malbaie',
    'Baie-Saint-Paul', 'Saint-Paul',
    'Clermont',
    'Saint-Siméon', 'Saint Simeon',
    'Les Éboulements', 'Eboulements',
    'Saint-Irénée', 'Saint Irenee',
    'Petite-Rivière-Saint-François', 'Petite Riviere',
    'Saint-Urbain', 'Saint Urbain',
    'Notre-Dame-des-Monts', 'Notre Dame des Monts',
    'Saint-Aimé-des-Lacs', 'Saint Aime des Lacs',
    'Saint-Fidèle', 'Saint Fidele',
    'Rivière-Malbaie', 'Riviere Malbaie',
    // Capitale-Nationale proche
    'Beaupré', 'Beaupre',
    'Sainte-Anne-de-Beaupré', 'Sainte Anne de Beaupre',
    'Château-Richer', 'Chateau Richer',
    'Saint-Tite-des-Caps', 'Saint Tite des Caps',
    'Saint-Ferréol-les-Neiges', 'Saint Ferreol'
];

/**
 * Vérifie si une ville correspond à une ville de Charlevoix PROCHE
 */
function matchesCharleVoixCity(cityName: string): { match: boolean; matchedCity?: string; confidence: number } {
    if (!cityName) {
        return { match: false, confidence: 0 };
    }

    const normalized = normalizeString(cityName);

    // Vérification exacte (après normalisation)
    for (const charleVoixCity of CHARLEVOIX_PROCHE_CITIES) {
        const normalizedTarget = normalizeString(charleVoixCity);

        if (normalized === normalizedTarget) {
            return { match: true, matchedCity: charleVoixCity, confidence: 100 };
        }

        // Vérification de sous-chaîne
        if (normalized.includes(normalizedTarget) || normalizedTarget.includes(normalized)) {
            return { match: true, matchedCity: charleVoixCity, confidence: 90 };
        }

        // Vérification avec distance de Levenshtein (tolérance aux fautes)
        const distance = levenshteinDistance(normalized, normalizedTarget);
        const maxLength = Math.max(normalized.length, normalizedTarget.length);
        const similarity = ((maxLength - distance) / maxLength) * 100;

        if (similarity >= 75) { // 75% de similarité minimum
            return { match: true, matchedCity: charleVoixCity, confidence: Math.round(similarity) };
        }
    }

    return { match: false, confidence: 0 };
}

async function findCharleVoixCandidates() {
    console.log('🔍 Recherche de candidats/prospects dans Charlevoix PROCHE (< 1h de La Malbaie)...\n');
    console.log('❌ EXCLUT: Chicoutimi, Jonquière, Alma, Tadoussac, Baie-Comeau (trop loin)\n');

    // 1. Chercher dans les candidats
    const candidates = await prisma.candidate.findMany({
        where: {
            isDeleted: false,
        },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            city: true,
            province: true,
            status: true,
        },
    });

    // 2. Chercher dans les prospects
    const prospects = await prisma.prospectCandidate.findMany({
        where: {
            isDeleted: false,
        },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            city: true,
            province: true,
        },
    });

    console.log(`📊 Total à analyser: ${candidates.length} candidats + ${prospects.length} prospects\n`);

    const matches: Array<{
        type: 'candidate' | 'prospect';
        id: string;
        name: string;
        email: string;
        phone: string;
        originalCity: string;
        matchedCity: string;
        confidence: number;
    }> = [];

    // Analyser les candidats
    for (const candidate of candidates) {
        const result = matchesCharleVoixCity(candidate.city);
        if (result.match) {
            matches.push({
                type: 'candidate',
                id: candidate.id,
                name: `${candidate.firstName} ${candidate.lastName}`,
                email: candidate.email || 'N/A',
                phone: candidate.phone || 'N/A',
                originalCity: candidate.city,
                matchedCity: result.matchedCity!,
                confidence: result.confidence,
            });
        }
    }

    // Analyser les prospects
    for (const prospect of prospects) {
        const result = matchesCharleVoixCity(prospect.city || '');
        if (result.match) {
            matches.push({
                type: 'prospect',
                id: prospect.id,
                name: `${prospect.firstName} ${prospect.lastName}`,
                email: prospect.email || 'N/A',
                phone: prospect.phone || 'N/A',
                originalCity: prospect.city || 'N/A',
                matchedCity: result.matchedCity!,
                confidence: result.confidence,
            });
        }
    }

    // Trier par confiance décroissante
    matches.sort((a, b) => b.confidence - a.confidence);

    console.log(`\n✅ ${matches.length} candidat(s)/prospect(s) trouvé(s) dans Charlevoix PROCHE:\n`);

    if (matches.length === 0) {
        console.log('❌ Aucun candidat trouvé dans cette région proche.');
        console.log('\n💡 Suggestions:');
        console.log('   - Importer des CVs spécifiquement de La Malbaie et Baie-Saint-Paul');
        console.log('   - Publier des offres d\'emploi locales sur Indeed/LinkedIn');
        console.log('   - Contacter les écoles/centres de formation de Charlevoix');
        console.log('   - Vérifier les candidats de Québec qui accepteraient de déménager');
    } else {
        matches.forEach((match, index) => {
            console.log(`${index + 1}. ${match.name} (${match.type.toUpperCase()})`);
            console.log(`   📍 Ville: ${match.originalCity} → ${match.matchedCity} (${match.confidence}% confiance)`);
            console.log(`   📧 Email: ${match.email}`);
            console.log(`   📱 Téléphone: ${match.phone}`);
            console.log(`   🆔 ID: ${match.id}`);
            console.log('');
        });

        // Statistiques par ville
        const cityCounts = matches.reduce((acc, match) => {
            acc[match.matchedCity] = (acc[match.matchedCity] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        console.log('\n📊 Répartition par ville:');
        Object.entries(cityCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([city, count]) => {
                console.log(`   ${city}: ${count} candidat(s)`);
            });
    }

    console.log('\n');
}

// Exécuter le script
findCharleVoixCandidates()
    .catch((error) => {
        console.error('❌ Erreur:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
