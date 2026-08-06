/**
 * Backfill du géocodage des mandats : calcule lat/lng pour ceux qui ont une
 * adresse mais pas encore de coordonnées. REJOUABLE.
 *
 * Lancer (depuis backend/) :
 *   npm run backfill:geocode-mandates                  # non géocodés seulement (écrit)
 *   npm run backfill:geocode-mandates -- --all         # recalcul complet — DRY-RUN
 *   npm run backfill:geocode-mandates -- --all --apply # recalcul complet — ÉCRIT
 *
 * --all réécrit lat/lng de toute la table : DRY-RUN par défaut, --apply pour
 * écrire. En dry-run on appelle resolveEmployeeCoordinates (pur, sans écriture)
 * au lieu de geocodeMandateById (qui persiste).
 */
import { prisma } from '../config/database';
import { geocodeMandateById } from '../services/mandateGeocode.service';
import { resolveEmployeeCoordinates } from '../services/addressGeocode.service';
import logger from '../config/logger';
import { classify, printAuditReport, GeocodeDelta } from './lib/geocodeAudit';

async function main() {
  const recomputeAll = process.argv.includes('--all');
  const dryRun = process.argv.includes('--dry-run') || (recomputeAll && !process.argv.includes('--apply'));

  const where: any = { isDeleted: false, NOT: [{ address: null }, { address: '' }] };
  if (!recomputeAll) where.lat = null;

  const mandates = await prisma.mandate.findMany({
    where,
    select: {
      id: true,
      name: true,
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
  for (const m of mandates) {
    const geo = dryRun
      ? await resolveEmployeeCoordinates(m) // pur : n'écrit rien
      : await geocodeMandateById(m.id);

    const before = m.lat != null && m.lng != null ? { lat: m.lat, lng: m.lng, source: m.geocodeSource } : null;
    const after = geo ? { lat: geo.lat, lng: geo.lng, source: geo.source } : null;
    const { verdict, movedKm } = classify(before, after);
    deltas.push({
      id: m.id,
      label: m.name,
      city: m.city,
      postalCode: m.postalCode,
      before,
      after,
      movedKm,
      verdict,
    });

    if (geo) tally[geo.source]++;
    else tally.unresolved++;
    done++;
    if (done % 25 === 0) console.log(`  … ${done}/${mandates.length}`);
  }

  const rejected = printAuditReport(deltas, 'géocodage des mandats', dryRun);
  if (rejected > 0) {
    console.error(`\n⛔ ${rejected} coordonnée(s) hors Québec — écriture refusée.\n`);
    process.exitCode = 1;
    return;
  }
  if (dryRun) return;

  const placed = tally.address + tally.postal + tally.city;
  logger.info(
    `[backfill-geocode-mandats] ${mandates.length} traité(s) — ${placed} placés (${tally.address} adresse, ${tally.postal} code postal, ${tally.city} ville), ${tally.unresolved} non résolus.`
  );
  console.log('\n=== Backfill géocodage des mandats ===');
  console.log(`Mode         : ${recomputeAll ? 'recalcul complet (--all)' : 'non géocodés seulement'}`);
  console.log(`Traités      : ${mandates.length}`);
  console.log(`Placés       : ${placed}`);
  console.log(`  - adresse exacte : ${tally.address}`);
  console.log(`  - code postal    : ${tally.postal}`);
  console.log(`  - ville          : ${tally.city}`);
  console.log(`Non résolus  : ${tally.unresolved}`);
}

main()
  .catch((e) => {
    console.error('[backfill-geocode-mandats] échec :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
