/**
 * Backfill du géocodage des candidats actifs : calcule lat/lng pour ceux qui
 * n'en ont pas encore. REJOUABLE (sûr à relancer).
 *
 * Stratégie « code postal d'abord » : code postal → centroïde FSA (offline),
 * sinon centre de la ville saisie. Voir resolveProspectCoordinates.
 *
 * Lancer (depuis backend/) :
 *   npx ts-node src/scripts/backfillCandidateGeocodes.ts          # seulement les non géocodés
 *   npx ts-node src/scripts/backfillCandidateGeocodes.ts --all    # recalcule TOUT
 *
 * Note : une ville absente du seed et jamais vue est mise en file de géocodage
 * Nominatim en arrière-plan (city_geocodes) ; un second passage la placera.
 */
import { prisma } from '../config/database';
import { resolveProspectCoordinates } from '../services/cityGeocode.service';
import logger from '../config/logger';

async function main() {
  const recomputeAll = process.argv.includes('--all');
  const where: any = { isDeleted: false };
  if (!recomputeAll) where.lat = null; // uniquement les candidats pas encore placés

  const candidates = await prisma.candidate.findMany({
    where,
    select: { id: true, postalCode: true, city: true },
  });

  let postal = 0;
  let city = 0;
  let unresolved = 0;

  for (const c of candidates) {
    const geo = await resolveProspectCoordinates({ postalCode: c.postalCode, city: c.city });
    if (geo) {
      await prisma.candidate.update({
        where: { id: c.id },
        data: { lat: geo.lat, lng: geo.lng, geocodedAt: new Date(), geocodeSource: geo.source },
      });
      if (geo.source === 'postal') postal++;
      else city++;
    } else {
      unresolved++;
    }
  }

  const total = candidates.length;
  const placed = postal + city;
  const pct = total ? Math.round((placed / total) * 100) : 0;
  logger.info(
    `[backfill-geocode-candidats] ${total} traité(s) — ${placed} placés (${postal} code postal, ${city} ville), ${unresolved} non résolus.`
  );
  console.log('\n=== Backfill géocodage des candidats ===');
  console.log(`Mode         : ${recomputeAll ? 'recalcul complet (--all)' : 'non géocodés seulement'}`);
  console.log(`Traités      : ${total}`);
  console.log(`Placés       : ${placed}  (${pct}%)`);
  console.log(`  - code postal : ${postal}`);
  console.log(`  - ville       : ${city}`);
  console.log(`Non résolus  : ${unresolved}`);
  if (unresolved > 0) {
    console.log('\nAstuce : relancer le script pour placer les villes géocodées entre-temps en arrière-plan.');
  }
}

main()
  .catch((e) => {
    console.error('[backfill-geocode-candidats] échec :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
