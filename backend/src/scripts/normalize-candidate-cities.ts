/**
 * Nettoyage unique des villes des candidats.
 *
 * Fusionne les variantes d'une même ville (accents, casse, tirets, suffixe
 * « , QC »…) vers UN nom canonique (seed si connu, sinon variante propre la
 * plus fréquente). Idempotent. Mutation d'une colonne texte non-clé → sûr.
 * Exécuter : npx ts-node src/scripts/normalize-candidate-cities.ts
 */
import { prisma } from '../config/database';
import { normalizeCityKey, canonicalCity } from '../utils/cityNormalize';

async function run() {
  console.log('🔄 Nettoyage des villes (candidats)...\n');

  const candidates = await prisma.candidate.findMany({
    where: { isDeleted: false },
    select: { city: true },
  });

  const groups = new Map<string, Map<string, number>>();
  for (const c of candidates) {
    const raw = (c.city || '').trim();
    if (!raw || raw === 'Non spécifié') continue;
    const key = normalizeCityKey(raw);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, new Map());
    const variants = groups.get(key)!;
    variants.set(raw, (variants.get(raw) || 0) + 1);
  }

  let totalUpdated = 0;
  let merged = 0;

  for (const [key, variants] of groups) {
    const mostFrequent = [...variants.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const canonical = canonicalCity(mostFrequent); // exact/alias/fuzzy/tidy

    for (const [raw] of variants) {
      if (raw === canonical) continue;
      const result = await prisma.candidate.updateMany({
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

  const after = await prisma.candidate.findMany({
    where: { isDeleted: false },
    select: { city: true },
  });
  const uniqueAfter = new Set(after.map((c) => (c.city || '').trim()).filter(Boolean)).size;

  console.log(`\n📊 ${totalUpdated} candidats mis à jour (${merged} variantes fusionnées).`);
  console.log(`🏙️  Villes uniques après nettoyage : ${uniqueAfter}`);

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error('❌ Erreur:', e);
  process.exit(1);
});
