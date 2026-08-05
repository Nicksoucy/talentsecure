/**
 * Backfill des disponibilités des candidats (colonnes `available24_7`,
 * `availableDays`, `availableEvenings`, `availableNights`, `availableWeekends`)
 * depuis la table `availabilities` — REJOUABLE (sûr à relancer).
 *
 * Pourquoi : ces colonnes existaient depuis `0_init` mais n'ont JAMAIS été
 * écrites par le code, alors que ce sont elles que lisent l'aperçu rapide, les
 * badges, la recherche avancée et le portail client. Tout l'historique (import
 * 2026 + saisies du formulaire d'entrevue) ne vit que dans `availabilities`.
 *
 * À lancer UNE FOIS après `prisma/sql/add_availability_evenings.sql`, puis au
 * besoin pour corriger une dérive. Ensuite, les chemins d'écriture de candidats
 * (création / mise à jour / conversion prospect) maintiennent les colonnes.
 *
 * Lancer (depuis backend/) :
 *   npx ts-node src/scripts/backfillCandidateAvailability.ts
 *   npx ts-node src/scripts/backfillCandidateAvailability.ts --dry-run
 *   # ou
 *   npm run backfill:availability
 */
import { prisma } from '../config/database';
import { flagsFromAvailabilityRows, AvailabilityFlags } from '../utils/availability';
import logger from '../config/logger';

const DRY_RUN = process.argv.includes('--dry-run');

/** Les colonnes diffèrent-elles des drapeaux reconstruits ? */
function differs(current: AvailabilityFlags, next: AvailabilityFlags): boolean {
  return (Object.keys(next) as (keyof AvailabilityFlags)[]).some((k) => current[k] !== next[k]);
}

async function main() {
  const candidates = await prisma.candidate.findMany({
    select: {
      id: true,
      available24_7: true,
      availableDays: true,
      availableEvenings: true,
      availableNights: true,
      availableWeekends: true,
      availabilities: { select: { type: true, isAvailable: true } },
    },
  });

  logger.info(
    `Backfill disponibilités : ${candidates.length} candidats à traiter${DRY_RUN ? ' (simulation)' : ''}…`
  );

  let updated = 0;
  let withRows = 0;

  for (const c of candidates) {
    // Aucune ligne d'historique → on ne touche pas aux colonnes (ne pas écraser
    // une saisie déjà faite via les nouvelles colonnes par des `false`).
    if (c.availabilities.length === 0) continue;
    withRows++;

    const next = flagsFromAvailabilityRows(c.availabilities);
    const current: AvailabilityFlags = {
      available24_7: c.available24_7,
      availableDays: c.availableDays,
      availableEvenings: c.availableEvenings,
      availableNights: c.availableNights,
      availableWeekends: c.availableWeekends,
    };

    if (!differs(current, next)) continue;

    if (!DRY_RUN) {
      await prisma.candidate.update({ where: { id: c.id }, data: next });
    }
    updated++;
  }

  logger.info(
    `✅ Backfill terminé : ${updated} candidats ${DRY_RUN ? 'à mettre à jour' : 'mis à jour'} ` +
      `(${withRows}/${candidates.length} avaient des disponibilités historiques).`
  );
}

main()
  .catch((e) => {
    logger.error('Backfill disponibilités échoué', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
