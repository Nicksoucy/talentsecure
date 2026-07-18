/**
 * Backfill du géocodage des mandats : calcule lat/lng pour ceux qui ont une
 * adresse mais pas encore de coordonnées. REJOUABLE.
 *
 * Lancer (depuis backend/) :
 *   npm run backfill:geocode-mandates          # non géocodés seulement
 *   npm run backfill:geocode-mandates -- --all # recalcule tout
 */
import { prisma } from '../config/database';
import { geocodeMandateById } from '../services/mandateGeocode.service';
import logger from '../config/logger';

async function main() {
  const recomputeAll = process.argv.includes('--all');
  const where: any = { isDeleted: false, NOT: [{ address: null }, { address: '' }] };
  if (!recomputeAll) where.lat = null;

  const mandates = await prisma.mandate.findMany({ where, select: { id: true } });

  const tally = { address: 0, postal: 0, city: 0, unresolved: 0 };
  let done = 0;
  for (const m of mandates) {
    const geo = await geocodeMandateById(m.id);
    if (geo) tally[geo.source]++;
    else tally.unresolved++;
    done++;
    if (done % 25 === 0) console.log(`  … ${done}/${mandates.length}`);
  }

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
