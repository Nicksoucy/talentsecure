/**
 * Seed du catalogue d'uniformes à partir des formulaires XGuard.
 * Crée les morceaux/équipements (par division) + leurs variantes (grandeurs)
 * avec un code-barres unique chacun. Idempotent : ré-exécutable sans doublon.
 *
 * Stock initial = 0 (les formulaires n'indiquent pas de quantités) → réappro via
 * l'app. Lancer :  npx ts-node src/scripts/seed-uniforms.ts
 */
import { prisma } from '../config/database';
import { generateUniqueBarcode } from '../services/uniform-barcode.service';
import { SEED_CATALOGUE } from '../constants/uniform';

async function main() {
  console.log('\n=== SEED CATALOGUE UNIFORMES ===\n');
  let itemsCreated = 0;
  let variantsCreated = 0;
  let sortOrder = 0;

  for (const block of SEED_CATALOGUE) {
    for (const seed of block.items) {
      sortOrder += 1;

      let item = await prisma.uniformItem.findFirst({
        where: { division: block.division, name: seed.name },
      });

      if (!item) {
        item = await prisma.uniformItem.create({
          data: {
            division: block.division,
            type: seed.type,
            name: seed.name,
            isOneSize: !!seed.isOneSize,
            defaultReplacementCost: seed.cost,
            sortOrder,
          },
        });
        itemsCreated += 1;
      }

      const sizes = seed.sizes && seed.sizes.length > 0 ? seed.sizes : ['Unique'];
      for (const size of sizes) {
        const existing = await prisma.uniformVariant.findUnique({
          where: { itemId_size: { itemId: item.id, size } },
        });
        if (existing) continue;
        const barcode = await generateUniqueBarcode();
        await prisma.uniformVariant.create({
          data: {
            itemId: item.id,
            size,
            barcode,
            replacementCost: seed.cost,
            quantityOnHand: 0,
          },
        });
        variantsCreated += 1;
      }
    }
  }

  const totalItems = await prisma.uniformItem.count();
  const totalVariants = await prisma.uniformVariant.count();

  console.log(`Morceaux créés cette exécution   : ${itemsCreated}`);
  console.log(`Variantes créées cette exécution : ${variantsCreated}`);
  console.log(`Total morceaux en base           : ${totalItems}`);
  console.log(`Total variantes en base          : ${totalVariants}`);
  console.log('\nSeed terminé. Stock initial à 0 — utilisez "Réappro" pour ajouter des quantités.\n');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
