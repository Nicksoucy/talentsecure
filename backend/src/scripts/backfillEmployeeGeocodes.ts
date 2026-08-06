/**
 * Backfill du géocodage des employés : calcule lat/lng pour ceux qui n'en ont
 * pas encore. REJOUABLE (sûr à relancer).
 *
 * Stratégie « adresse d'abord » : adresse exacte (Nominatim, ~1,1 s/adresse) →
 * centroïde FSA du code postal (offline) → centre de la ville. Voir
 * resolveEmployeeCoordinates. Par défaut : ACTIFS non géocodés seulement
 * (la carte n'affiche que les actifs ; le backlog INACTIF coûterait ~1 s/ligne).
 *
 * Lancer (depuis backend/) :
 *   npm run backfill:geocode-employees                        # ACTIFS sans lat (écrit)
 *   npm run backfill:geocode-employees -- --all               # tous les ACTIFS — DRY-RUN
 *   npm run backfill:geocode-employees -- --all --apply       # tous les ACTIFS — ÉCRIT
 *   npm run backfill:geocode-employees -- --include-inactifs  # inclut les INACTIFS
 *
 * --all réécrit lat/lng de toute la sélection : DRY-RUN par défaut, --apply pour
 * écrire. En dry-run on appelle resolveEmployeeCoordinates (pur, sans écriture)
 * au lieu de geocodeEmployeeById (qui persiste).
 */
import { prisma } from '../config/database';
import { geocodeEmployeeById, resolveEmployeeCoordinates } from '../services/addressGeocode.service';
import logger from '../config/logger';
import { classify, printAuditReport, GeocodeDelta } from './lib/geocodeAudit';

async function main() {
  const recomputeAll = process.argv.includes('--all');
  const includeInactifs = process.argv.includes('--include-inactifs');
  const dryRun = process.argv.includes('--dry-run') || (recomputeAll && !process.argv.includes('--apply'));

  const where: any = { isDeleted: false };
  if (!includeInactifs) where.status = 'ACTIF';
  if (!recomputeAll) where.lat = null; // uniquement les employés pas encore placés

  const employees = await prisma.employee.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      address: true,
      city: true,
      postalCode: true,
      lat: true,
      lng: true,
      geocodeSource: true,
    },
  });

  const tally = { address: 0, postal: 0, city: 0, unresolved: 0 };
  const deltas: GeocodeDelta[] = [];
  let done = 0;
  for (const e of employees) {
    const geo = dryRun
      ? await resolveEmployeeCoordinates(e) // pur : n'écrit rien
      : await geocodeEmployeeById(e.id);

    const before = e.lat != null && e.lng != null ? { lat: e.lat, lng: e.lng, source: e.geocodeSource } : null;
    const after = geo ? { lat: geo.lat, lng: geo.lng, source: geo.source } : null;
    const { verdict, movedKm } = classify(before, after);
    deltas.push({
      id: e.id,
      label: `${e.firstName} ${e.lastName}`.trim(),
      city: e.city,
      postalCode: e.postalCode,
      before,
      after,
      movedKm,
      verdict,
    });

    if (geo) tally[geo.source]++;
    else tally.unresolved++;
    done++;
    if (done % 25 === 0) console.log(`  … ${done}/${employees.length}`);
  }

  const rejected = printAuditReport(deltas, 'géocodage des employés', dryRun);
  if (rejected > 0) {
    console.error(`\n⛔ ${rejected} coordonnée(s) hors Québec — écriture refusée.\n`);
    process.exitCode = 1;
    return;
  }
  if (dryRun) return;

  const total = employees.length;
  const placed = tally.address + tally.postal + tally.city;
  const pct = total ? Math.round((placed / total) * 100) : 0;
  logger.info(
    `[backfill-geocode-employes] ${total} traité(s) — ${placed} placés (${tally.address} adresse, ${tally.postal} code postal, ${tally.city} ville), ${tally.unresolved} non résolus.`
  );
  console.log('\n=== Backfill géocodage des employés ===');
  console.log(`Mode         : ${recomputeAll ? 'recalcul complet (--all)' : 'non géocodés seulement'}${includeInactifs ? ' + inactifs' : ' (ACTIFS)'}`);
  console.log(`Traités      : ${total}`);
  console.log(`Placés       : ${placed}  (${pct}%)`);
  console.log(`  - adresse exacte : ${tally.address}`);
  console.log(`  - code postal    : ${tally.postal}`);
  console.log(`  - ville          : ${tally.city}`);
  console.log(`Non résolus  : ${tally.unresolved}`);
  if (tally.unresolved > 0) {
    console.log('\nAstuce : relancer le script pour placer les villes géocodées entre-temps en arrière-plan.');
  }
}

main()
  .catch((e) => {
    console.error('[backfill-geocode-employes] échec :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
