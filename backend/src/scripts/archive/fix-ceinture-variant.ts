/**
 * Migration ponctuelle :
 *   1) Active la variante « Unique » du item Ceinture (currently isActive=false).
 *   2) Bascule toutes les lignes UniformIssuanceLine ayant customItemName="Ceinture"
 *      vers cette variante (variantId set, customItemName cleared).
 *
 * Effet : les 47 ceintures historiques apparaissent dans « Détentions actuelles ».
 *
 * Lance en DRY-RUN par défaut. `--apply` pour persister.
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CEINTURE_UNIQUE_VARIANT_ID = 'b0de2dc3-7933-4b06-bb37-9970d876ea70';
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`\n🔧 fix-ceinture-variant ${APPLY ? '(APPLY MODE)' : '(DRY-RUN)'}\n`);

  // 1) Sanity-check : la variante existe et appartient bien à un item nommé "Ceinture"
  const variant = await prisma.uniformVariant.findUnique({
    where: { id: CEINTURE_UNIQUE_VARIANT_ID },
    include: { item: true },
  });
  if (!variant) {
    throw new Error(`Variante introuvable : ${CEINTURE_UNIQUE_VARIANT_ID}`);
  }
  console.log(`Variante cible : ${variant.item.name} | size=${variant.size} | isActive=${variant.isActive} | barcode=${variant.barcode}`);
  if (variant.item.name !== 'Ceinture') {
    throw new Error(`Sécurité : la variante ${CEINTURE_UNIQUE_VARIANT_ID} appartient à « ${variant.item.name} », pas Ceinture. Abort.`);
  }
  if (variant.size !== 'Unique') {
    throw new Error(`Sécurité : la variante ${CEINTURE_UNIQUE_VARIANT_ID} a size="${variant.size}", pas "Unique". Abort.`);
  }

  // 2) Compte les lignes à migrer
  const linesToMigrate = await prisma.uniformIssuanceLine.findMany({
    where: { customItemName: 'Ceinture', variantId: null },
    select: { id: true, issuanceId: true, quantity: true, unitCostSnapshot: true },
  });
  console.log(`\nLignes à migrer : ${linesToMigrate.length}`);
  let totalQty = 0;
  for (const l of linesToMigrate) totalQty += l.quantity;
  console.log(`Quantité totale : ${totalQty} ceintures\n`);

  if (linesToMigrate.length === 0) {
    console.log(`Rien à migrer. Exit.`);
    return;
  }

  // 3) APPLY : transaction
  if (APPLY) {
    const result = await prisma.$transaction(async (tx) => {
      // (a) Active la variante si nécessaire
      let activated = false;
      if (!variant.isActive) {
        await tx.uniformVariant.update({
          where: { id: CEINTURE_UNIQUE_VARIANT_ID },
          data: { isActive: true },
        });
        activated = true;
      }
      // (b) Bulk update des lignes
      const upd = await tx.uniformIssuanceLine.updateMany({
        where: { customItemName: 'Ceinture', variantId: null },
        data: { variantId: CEINTURE_UNIQUE_VARIANT_ID, customItemName: null },
      });
      return { activated, updatedCount: upd.count };
    });

    console.log(`✓ Variante activée : ${result.activated ? 'oui' : 'déjà active'}`);
    console.log(`✓ Lignes migrées   : ${result.updatedCount}\n`);

    // 4) Vérification
    const remaining = await prisma.uniformIssuanceLine.count({
      where: { customItemName: 'Ceinture', variantId: null },
    });
    console.log(`Restant à migrer (devrait être 0) : ${remaining}`);
    const linked = await prisma.uniformIssuanceLine.count({
      where: { variantId: CEINTURE_UNIQUE_VARIANT_ID },
    });
    console.log(`Lignes pointant sur la variante Unique de Ceinture : ${linked}`);
  } else {
    console.log(`(dry-run) Aurait :`);
    console.log(`  - activé la variante ${CEINTURE_UNIQUE_VARIANT_ID} (Ceinture/Unique)`);
    console.log(`  - update ${linesToMigrate.length} ligne(s)`);
    console.log(`\nRelance avec --apply pour persister.`);
  }
}

main()
  .catch((e) => { console.error('FATAL:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
