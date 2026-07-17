/**
 * Complète la VILLE et le CODE POSTAL manquants des employés géolocalisés, par
 * géocodage inverse de leurs coordonnées (Nominatim, ~1,1 s/fiche). Cas visé :
 * adresse Agendrix sans ville détectable → point exact trouvé mais fiche
 * incomplète. N'écrase JAMAIS une valeur existante. REJOUABLE.
 *
 * Lancer (depuis backend/) :
 *   npm run backfill:employee-contact                        # ACTIFS géolocalisés incomplets
 *   npm run backfill:employee-contact -- --include-inactifs  # inclut les INACTIFS
 */
import { prisma } from '../config/database';
import { fillMissingContactFieldsFromCoords } from '../services/addressGeocode.service';
import logger from '../config/logger';

async function main() {
  const includeInactifs = process.argv.includes('--include-inactifs');

  const where: any = {
    isDeleted: false,
    lat: { not: null },
    OR: [{ city: null }, { city: '' }, { postalCode: null }, { postalCode: '' }],
  };
  if (!includeInactifs) where.status = 'ACTIF';

  const employees = await prisma.employee.findMany({
    where,
    select: { id: true, firstName: true, lastName: true },
  });
  console.log(`Fiches géolocalisées incomplètes à traiter : ${employees.length}`);

  let filledCity = 0;
  let filledPostal = 0;
  let untouched = 0;
  for (const e of employees) {
    const res = await fillMissingContactFieldsFromCoords(e.id);
    if (res) {
      if (res.city) filledCity++;
      if (res.postalCode) filledPostal++;
      console.log(
        `  ✓ ${e.firstName} ${e.lastName}${res.city ? ` — ville: ${res.city}` : ''}${res.postalCode ? ` — CP: ${res.postalCode}` : ''}`
      );
    } else {
      untouched++;
    }
  }

  logger.info(
    `[backfill-employee-contact] ${employees.length} traité(s) — ${filledCity} villes, ${filledPostal} codes postaux complétés, ${untouched} sans résultat.`
  );
  console.log('\n=== Backfill ville/CP par géocodage inverse ===');
  console.log(`Traités          : ${employees.length}`);
  console.log(`Villes ajoutées  : ${filledCity}`);
  console.log(`CP ajoutés       : ${filledPostal}`);
  console.log(`Sans résultat    : ${untouched}`);
}

main()
  .catch((e) => {
    console.error('[backfill-employee-contact] échec :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
