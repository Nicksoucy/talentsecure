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
 *   npm run backfill:geocode-employees                        # ACTIFS sans lat
 *   npm run backfill:geocode-employees -- --all               # recalcule tous les ACTIFS
 *   npm run backfill:geocode-employees -- --include-inactifs  # inclut les INACTIFS
 */
import { prisma } from '../config/database';
import { geocodeEmployeeById } from '../services/addressGeocode.service';
import logger from '../config/logger';

async function main() {
  const recomputeAll = process.argv.includes('--all');
  const includeInactifs = process.argv.includes('--include-inactifs');

  const where: any = { isDeleted: false };
  if (!includeInactifs) where.status = 'ACTIF';
  if (!recomputeAll) where.lat = null; // uniquement les employés pas encore placés

  const employees = await prisma.employee.findMany({ where, select: { id: true } });

  const tally = { address: 0, postal: 0, city: 0, unresolved: 0 };
  let done = 0;
  for (const e of employees) {
    const geo = await geocodeEmployeeById(e.id);
    if (geo) tally[geo.source]++;
    else tally.unresolved++;
    done++;
    if (done % 25 === 0) console.log(`  … ${done}/${employees.length}`);
  }

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
