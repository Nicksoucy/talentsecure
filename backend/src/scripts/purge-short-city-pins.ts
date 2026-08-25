/**
 * Nettoyage des épingles posées à partir d'un nom de ville qui n'en est pas un.
 * DRY-RUN par défaut ; écrit seulement avec --apply.
 *
 * Le problème : « QC » et « M » ont été envoyés à Nominatim comme s'il s'agissait
 * de municipalités. Nominatim répond toujours quelque chose — « QC » a été résolu
 * en plein territoire d'Eeyou Istchee Baie-James (51.70, -76.81), à ~700 km de
 * Montréal — et la réponse a été MÉMORISÉE dans city_geocodes, donc chaque fiche
 * suivante héritait du même point.
 *
 * isGeocodableCityName empêche désormais la récidive, mais ne défait pas ce qui
 * est déjà en base. Ce script fait les deux nettoyages :
 *   1. supprime du cache city_geocodes les entrées dont la clé est trop courte ;
 *   2. remet à NULL la position des fiches placées PAR CETTE VILLE (source
 *      'city') dont le nom de ville n'est pas géocodable.
 *
 * On remet à NULL plutôt que de re-placer : on ne sait tout simplement pas où
 * ces personnes habitent. « Absente de la carte » est honnête ; « épinglée à
 * 700 km » ne l'est pas — et une fiche non placée est comptée et affichée sous
 * la carte, donc elle reste visible pour les RH.
 *
 * Ne touche JAMAIS une fiche placée par code postal ('postal') ou à la rue
 * ('address') : leur position ne vient pas du nom de ville.
 *
 *   npx ts-node src/scripts/purge-short-city-pins.ts           # DRY-RUN
 *   npx ts-node src/scripts/purge-short-city-pins.ts --apply   # écrit
 */
import { prisma } from '../config/database';
import { isGeocodableCityName } from '../services/cityGeocode.service';

const APPLY = process.argv.includes('--apply');

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));

async function main(): Promise<void> {
  console.log(`\n🧹 Épingles issues d'un nom de ville trop court — ${APPLY ? 'ÉCRITURE' : 'DRY-RUN'}\n`);

  // 1) Entrées de cache empoisonnées ------------------------------------------
  const cache = await prisma.cityGeocode.findMany();
  const badCache = cache.filter((c) => !isGeocodableCityName(c.cityKey));
  console.log(`   Cache city_geocodes : ${badCache.length} entrée(s) à supprimer`);
  for (const c of badCache) {
    const pos = c.found && c.lat != null ? `${c.lat.toFixed(4)}, ${c.lng!.toFixed(4)}` : 'non résolue';
    console.log(`      « ${pad(c.city, 12)} » (clé « ${c.cityKey} ») → ${pos}`);
  }

  // 2) Fiches placées par ce nom de ville --------------------------------------
  const [prospects, candidates] = await Promise.all([
    prisma.prospectCandidate.findMany({
      where: { isDeleted: false, geocodeSource: 'city', lat: { not: null } },
      select: { id: true, firstName: true, lastName: true, city: true, lat: true, lng: true },
    }),
    prisma.candidate.findMany({
      where: { isDeleted: false, geocodeSource: 'city', lat: { not: null } },
      select: { id: true, firstName: true, lastName: true, city: true, lat: true, lng: true },
    }),
  ]);

  const bad = (list: typeof prospects) => list.filter((p) => !isGeocodableCityName(p.city));
  const badProspects = bad(prospects);
  const badCandidates = bad(candidates as typeof prospects);
  const total = badProspects.length + badCandidates.length;

  console.log(`\n   Fiches à dépingler : ${total} (${badProspects.length} prospect(s), ${badCandidates.length} candidat(s))`);
  for (const [section, list] of [
    ['prospect', badProspects],
    ['candidat', badCandidates],
  ] as const) {
    for (const p of list) {
      console.log(
        `      ${pad(section, 10)}${pad(`${p.firstName} ${p.lastName}`.trim(), 30)}` +
          `ville « ${pad(p.city ?? '—', 6)} » → épingle ${p.lat!.toFixed(4)}, ${p.lng!.toFixed(4)}`
      );
    }
  }

  if (!APPLY) {
    console.log('\n   DRY-RUN — rien n’a été écrit. Relancer avec --apply pour appliquer.\n');
    return;
  }

  const clear = { lat: null, lng: null, geocodedAt: null, geocodeSource: null };
  const [delCache, updP, updC] = await prisma.$transaction([
    prisma.cityGeocode.deleteMany({ where: { id: { in: badCache.map((c) => c.id) } } }),
    prisma.prospectCandidate.updateMany({
      where: { id: { in: badProspects.map((p) => p.id) } },
      data: clear,
    }),
    prisma.candidate.updateMany({
      where: { id: { in: badCandidates.map((p) => p.id) } },
      data: clear,
    }),
  ]);

  console.log(`\n   ✔ ${delCache.count} entrée(s) de cache supprimée(s)`);
  console.log(`   ✔ ${updP.count} prospect(s) et ${updC.count} candidat(s) dépinglés`);
  console.log('   Ils apparaissent maintenant dans le compteur « non géolocalisés » sous la carte.\n');
}

main()
  .catch((e) => {
    console.error('[purge-short-city-pins] échec :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
