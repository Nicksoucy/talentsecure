/**
 * Backfill du total de mois d'expérience des candidats
 * (`Candidate.totalExperienceMonths`) — REJOUABLE (sûr à relancer).
 *
 * À lancer UNE FOIS après la migration `20260614000000_add_candidate_experience_months`
 * (la colonne arrive à 0 par défaut), puis au besoin pour corriger une dérive.
 * Le calcul ensuite est maintenu en continu par les chemins d'écriture de
 * candidats (création / mise à jour / conversion prospect).
 *
 * Lancer (depuis backend/) :
 *   npx ts-node src/scripts/backfillExperienceMonths.ts
 *   # ou
 *   npm run backfill:experience-months
 */
import { prisma } from '../config/database';
import { computeExperienceMonths } from '../utils/experience';
import logger from '../config/logger';

async function main() {
  const candidates = await prisma.candidate.findMany({
    select: {
      id: true,
      totalExperienceMonths: true,
      experiences: { select: { durationMonths: true, startDate: true, endDate: true } },
    },
  });

  logger.info(`Backfill expérience : ${candidates.length} candidats à traiter…`);
  let updated = 0;
  for (const c of candidates) {
    const total = computeExperienceMonths(c.experiences);
    if (total !== c.totalExperienceMonths) {
      await prisma.candidate.update({ where: { id: c.id }, data: { totalExperienceMonths: total } });
      updated++;
    }
  }
  logger.info(`✅ Backfill terminé : ${updated}/${candidates.length} candidats mis à jour.`);
}

main()
  .catch((e) => {
    logger.error('Backfill expérience échoué', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
