/**
 * Backfill du géocodage des prospects : calcule lat/lng pour les Candidats
 * Potentiels qui n'en ont pas encore. REJOUABLE (sûr à relancer).
 *
 * Stratégie « code postal d'abord » : code postal → centroïde FSA (offline),
 * sinon centre de la ville saisie. Voir resolveProspectCoordinates.
 *
 * Lancer (depuis backend/) :
 *   npx ts-node src/scripts/backfillProspectGeocodes.ts                 # non géocodés seulement (écrit)
 *   npx ts-node src/scripts/backfillProspectGeocodes.ts --all           # recalcul complet — DRY-RUN
 *   npx ts-node src/scripts/backfillProspectGeocodes.ts --all --apply   # recalcul complet — ÉCRIT
 *   …            --repin-city-first           # seulement les FSA « ville d'abord » — DRY-RUN
 *   …            --repin-city-first --apply   # …et écrit
 *
 * --all réécrit lat/lng de TOUTE la table : il est donc en DRY-RUN par défaut et
 * exige --apply pour écrire. Le rapport imprime ce qui bougerait, de combien, et
 * bloque si une coordonnée tombe hors des bornes du Québec.
 *
 * Note : une ville absente du seed et jamais vue est mise en file de géocodage
 * Nominatim en arrière-plan (city_geocodes) ; un second passage la placera.
 * Pour tout résoudre d'un coup avant le backfill : npm run prewarm:cities.
 */
import { prisma } from '../config/database';
import { prefersCityOverFSA, resolveProspectCoordinates } from '../services/cityGeocode.service';
import logger from '../config/logger';
import { classify, printAuditReport, GeocodeDelta } from './lib/geocodeAudit';

async function main() {
  const recomputeAll = process.argv.includes('--all');
  // Recalcul CIBLÉ : uniquement les fiches dont le secteur postal a perdu la
  // priorité au profit de la ville (FSA rurale, ou FSA urbaine au centroïde
  // faux — cf. UNRELIABLE_FSA_CENTROIDS). Sert à rejouer un changement de
  // règle sans réécrire toute la table comme le ferait --all.
  const repinCityFirst = process.argv.includes('--repin-city-first');
  // Toute réécriture de fiches DÉJÀ placées est destructive : dry-run tant que
  // --apply n'est pas donné.
  const rewrites = recomputeAll || repinCityFirst;
  const dryRun = process.argv.includes('--dry-run') || (rewrites && !process.argv.includes('--apply'));

  const where: any = { isDeleted: false };
  if (!rewrites) {
    where.lat = null; // uniquement les prospects pas encore placés
  } else {
    // NE JAMAIS écraser une position à la RUE : resolveProspectCoordinates ne
    // sait produire que 'postal' ou 'city', donc un recalcul complet dégraderait
    // les fiches géocodées à l'adresse exacte par contractGeocode.service.
    where.NOT = { geocodeSource: 'address' };
  }

  const prospects = await prisma.prospectCandidate.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      postalCode: true,
      city: true,
      lat: true,
      lng: true,
      geocodeSource: true,
    },
  });

  // Le filtre « ville d'abord » se fait en JS : le code postal saisi varie en
  // casse et en espacement (« J7v4m9 », « H7 N2N1 »), ce qu'un startsWith SQL
  // ne rattraperait pas. Les tables sont petites, le coût est négligeable.
  const selection = repinCityFirst ? prospects.filter((r) => prefersCityOverFSA(r.postalCode)) : prospects;

  let postal = 0;
  let city = 0;
  let unresolved = 0;
  const deltas: GeocodeDelta[] = [];

  for (const p of selection) {
    const geo = await resolveProspectCoordinates({ postalCode: p.postalCode, city: p.city });

    const before = p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng, source: p.geocodeSource } : null;
    const after = geo ? { lat: geo.lat, lng: geo.lng, source: geo.source } : null;
    const { verdict, movedKm } = classify(before, after, { keepsExistingWhenUnresolved: true });
    deltas.push({
      id: p.id,
      label: `${p.firstName} ${p.lastName}`.trim(),
      city: p.city,
      postalCode: p.postalCode,
      before,
      after,
      movedKm,
      verdict,
    });

    if (geo) {
      // Garde-fou dur : jamais d'écriture hors des bornes du Québec.
      if (verdict !== 'REJETÉ_HORS_QC' && !dryRun) {
        await prisma.prospectCandidate.update({
          where: { id: p.id },
          data: { lat: geo.lat, lng: geo.lng, geocodedAt: new Date(), geocodeSource: geo.source },
        });
      }
      if (geo.source === 'postal') postal++;
      else city++;
    } else {
      unresolved++;
    }
  }

  const rejected = printAuditReport(deltas, 'géocodage des prospects', dryRun);
  if (rejected > 0) {
    console.error(`\n⛔ ${rejected} coordonnée(s) hors Québec — écriture refusée. Corriger les données source.\n`);
    process.exitCode = 1;
    return;
  }
  if (dryRun) return;

  const total = selection.length;
  const placed = postal + city;
  const pct = total ? Math.round((placed / total) * 100) : 0;
  logger.info(
    `[backfill-geocode] ${total} traité(s) — ${placed} placés (${postal} code postal, ${city} ville), ${unresolved} non résolus.`
  );
  console.log('\n=== Backfill géocodage des prospects ===');
  const mode = recomputeAll
    ? 'recalcul complet (--all)'
    : repinCityFirst
      ? 'FSA « ville d’abord » seulement (--repin-city-first)'
      : 'non géocodés seulement';
  console.log(`Mode         : ${mode}`);
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
    console.error('[backfill-geocode] échec :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
