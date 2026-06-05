/**
 * Nettoyage unique des villes des candidats potentiels.
 *
 * Fusionne toutes les variantes d'une même ville (accents, casse, tirets,
 * suffixe « , QC »…) vers UN nom canonique :
 *   - nom du seed si la ville est connue (ex. Montréal),
 *   - sinon la variante « propre » la plus fréquente.
 *
 * Idempotent (re-exécutable). Mutation d'une colonne texte non-clé → sûr.
 * Exécuter : npx ts-node src/scripts/normalize-prospect-cities-v2.ts
 */
import { prisma } from '../config/database';
import { normalizeCityKey, seedCanonicalName, tidyCity } from '../utils/cityNormalize';

async function run() {
  console.log('🔄 Nettoyage des villes (candidats potentiels)...\n');

  const prospects = await prisma.prospectCandidate.findMany({
    where: { isDeleted: false, city: { not: null } },
    select: { city: true },
  });

  // Groupe par clé normalisée : { rawVariant → count }
  const groups = new Map<string, Map<string, number>>();
  for (const p of prospects) {
    const raw = (p.city || '').trim();
    if (!raw) continue;
    const key = normalizeCityKey(raw);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, new Map());
    const variants = groups.get(key)!;
    variants.set(raw, (variants.get(raw) || 0) + 1);
  }

  let totalUpdated = 0;
  let merged = 0;

  for (const [key, variants] of groups) {
    // Nom canonique : seed si connu, sinon variante propre la plus fréquente.
    const mostFrequent = [...variants.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const canonical = seedCanonicalName(key) || tidyCity(mostFrequent);

    for (const [raw] of variants) {
      if (raw === canonical) continue;
      const result = await prisma.prospectCandidate.updateMany({
        where: { city: raw },
        data: { city: canonical },
      });
      if (result.count > 0) {
        console.log(`  "${raw}" → "${canonical}" : ${result.count}`);
        totalUpdated += result.count;
        merged += 1;
      }
    }
  }

  // Récap
  const after = await prisma.prospectCandidate.findMany({
    where: { isDeleted: false, city: { not: null } },
    select: { city: true },
  });
  const uniqueAfter = new Set(after.map((p) => (p.city || '').trim()).filter(Boolean)).size;

  console.log(`\n📊 ${totalUpdated} prospects mis à jour (${merged} variantes fusionnées).`);
  console.log(`🏙️  Villes uniques après nettoyage : ${uniqueAfter}`);

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error('❌ Erreur:', e);
  process.exit(1);
});
