/**
 * PRÉ-CHAUFFAGE du cache city_geocodes.
 *
 * Pourquoi : resolveCityCoordinates géocode les villes inconnues EN ARRIÈRE-PLAN
 * et renvoie null pour l'appel courant. Si rien ne rejoue ensuite, la ville reste
 * non résolue indéfiniment — et ses fiches retombent sur le centroïde de leur FSA.
 * Avec des FSA rurales (J0J, J0K…) ce centroïde est à 20-100 km du village.
 * Ce script résout d'un coup toutes les villes présentes en base et remplit le
 * cache, pour que le backfill de géocodage puisse ensuite placer les fiches
 * correctement.
 *
 *   npx ts-node src/scripts/prewarm-city-geocodes.ts            # DRY-RUN (défaut)
 *   npx ts-node src/scripts/prewarm-city-geocodes.ts --apply    # écrit le cache
 *
 * N'ÉCRIT QUE DES RÉSULTATS POSITIFS. Un « non trouvé » n'est jamais mémorisé :
 * nominatimSearch renvoie null aussi bien pour « ville inexistante » que pour un
 * timeout réseau, et un found=false est définitif (plus jamais retenté). En cas
 * de doute on préfère re-questionner au prochain passage.
 *
 * Écrit UNIQUEMENT dans city_geocodes — aucune fiche personne n'est touchée.
 */
import { prisma } from '../config/database';
import { geocodeNominatim } from '../services/cityGeocode.service';
import { normalizeCityKey } from '../utils/cityNormalize';
import { quebecCitiesCoordinates } from '../data/quebecCities';

const APPLY = process.argv.includes('--apply');

const seedKeys = new Set(Object.keys(quebecCitiesCoordinates).map((n) => normalizeCityKey(n)));

async function main(): Promise<void> {
  console.log(`\n🔥 Pré-chauffage du cache de villes — ${APPLY ? 'APPLICATION' : 'DRY-RUN (aucune écriture)'}\n`);

  // 1) Villes distinctes réellement présentes en base.
  const [prospects, candidates, employees, mandates] = await Promise.all([
    prisma.prospectCandidate.findMany({ where: { isDeleted: false }, select: { city: true } }),
    prisma.candidate.findMany({ where: { isDeleted: false }, select: { city: true } }),
    prisma.employee.findMany({ where: { isDeleted: false }, select: { city: true } }),
    prisma.mandate.findMany({ where: { isDeleted: false }, select: { city: true } }),
  ]);

  const byKey = new Map<string, { city: string; count: number }>();
  for (const row of [...prospects, ...candidates, ...employees, ...mandates]) {
    const key = normalizeCityKey(row.city);
    if (!key) continue;
    const e = byKey.get(key);
    if (e) e.count++;
    else byKey.set(key, { city: (row.city || '').trim(), count: 1 });
  }

  // 2) Retirer ce qui est déjà résolu : seed statique + cache DB existant.
  const cached = await prisma.cityGeocode.findMany({ select: { cityKey: true } });
  const cachedKeys = new Set(cached.map((c) => c.cityKey));

  const todo = [...byKey.entries()]
    .filter(([k]) => !seedKeys.has(k) && !cachedKeys.has(k))
    .sort((a, b) => b[1].count - a[1].count);

  console.log(`   villes distinctes en base : ${byKey.size}`);
  console.log(`   déjà résolues (seed+cache): ${byKey.size - todo.length}`);
  console.log(`   à géocoder                : ${todo.length}\n`);

  if (todo.length === 0) {
    console.log('   Rien à faire. 🎉\n');
    return;
  }
  console.log(`   Nominatim ~1 req/s → ≈ ${Math.ceil((todo.length * 1.1) / 60)} min\n`);

  const found: { city: string; count: number; lat: number; lng: number }[] = [];
  const notFound: { city: string; count: number }[] = [];

  for (const [, v] of todo) {
    const coords = await geocodeNominatim(v.city);
    if (coords) {
      found.push({ ...v, ...coords });
      console.log(`   ✅ ${v.city.padEnd(38)} → ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}   (${v.count} fiche(s))`);
    } else {
      notFound.push(v);
      console.log(`   ✖  ${v.city.padEnd(38)}   NON TROUVÉ AU QUÉBEC        (${v.count} fiche(s))`);
    }
  }

  console.log(`\n   ${found.length} résolue(s), ${notFound.length} non trouvée(s).`);
  if (notFound.length > 0) {
    console.log(`   Les « non trouvé » ne sont PAS mémorisés — ils seront retentés au prochain passage.`);
  }

  if (!APPLY) {
    console.log('\n   ⚠️  DRY-RUN : aucune écriture. Relire la liste ci-dessus — un nom ambigu');
    console.log('       (Saint-Paul, Saint-Gabriel…) peut résoudre au mauvais endroit.');
    console.log('       Relancer avec --apply pour écrire le cache.\n');
    return;
  }

  for (const f of found) {
    const key = normalizeCityKey(f.city);
    await prisma.cityGeocode.upsert({
      where: { cityKey: key },
      update: { lat: f.lat, lng: f.lng, found: true, source: 'nominatim', city: f.city },
      create: {
        cityKey: key,
        city: f.city,
        lat: f.lat,
        lng: f.lng,
        found: true,
        source: 'nominatim',
      },
    });
  }
  console.log(`\n   ✅ ${found.length} ville(s) écrite(s) dans city_geocodes. Aucune fiche personne touchée.\n`);
}

main()
  .catch((e) => {
    console.error('[prewarm-city-geocodes] échec :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
