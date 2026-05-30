/**
 * Inspecte (et optionnellement répare) les lignes restantes avec variantId=NULL.
 * Après fix-ceinture-variant, il ne devrait rester que des cas isolés.
 *
 * Pour chaque ligne, propose une variante matchée par (itemName from customItemName)
 * + (size si déductible). En APPLY, migre.
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`\n🔧 fix-remaining-custom ${APPLY ? '(APPLY MODE)' : '(DRY-RUN)'}\n`);

  const orphans = await prisma.uniformIssuanceLine.findMany({
    where: { variantId: null, customItemName: { not: null } },
    include: { issuance: { select: { employeeId: true, issuedAt: true } } },
  });
  console.log(`Lignes orphelines (variantId=null) restantes : ${orphans.length}\n`);

  for (const l of orphans) {
    const emp = await prisma.employee.findUnique({ where: { id: l.issuance.employeeId }, select: { firstName: true, lastName: true } });
    console.log(`  • ${l.issuance.issuedAt?.toISOString().slice(0, 10)} ${emp?.firstName} ${emp?.lastName}`);
    console.log(`    customItemName=« ${l.customItemName} » qty=${l.quantity} unitCost=$${Number(l.unitCostSnapshot).toFixed(2)}`);

    // Heuristique : parse "Chemise grise (ML) [XS]" → itemName="Chemise grise (ML)" + size="XS"
    const raw = l.customItemName || '';
    const sizeMatch = raw.match(/\[([^\]]+)\]\s*$/);
    const size = sizeMatch?.[1].trim();
    const itemName = sizeMatch ? raw.slice(0, sizeMatch.index).trim() : raw;

    const item = await prisma.uniformItem.findFirst({
      where: { name: itemName },
      include: { variants: true },
    });
    if (!item) {
      console.log(`    ✗ Item « ${itemName} » introuvable en BD`);
      continue;
    }
    console.log(`    Item trouvé : ${item.name} (${item.variants.length} variants)`);

    let target = size
      ? item.variants.find((v) => v.size.toUpperCase() === size.toUpperCase())
      : item.variants.find((v) => v.size === 'Unique');
    if (!target && size) {
      // Si pas trouvé avec size, essaie "Unique"
      target = item.variants.find((v) => v.size === 'Unique');
    }
    if (!target) {
      console.log(`    ✗ Aucune variante pour size="${size ?? 'Unique'}"`);
      continue;
    }
    console.log(`    → cible: variant size=${target.size} isActive=${target.isActive} id=${target.id}`);

    if (APPLY) {
      await prisma.$transaction(async (tx) => {
        if (!target!.isActive) {
          await tx.uniformVariant.update({ where: { id: target!.id }, data: { isActive: true } });
        }
        await tx.uniformIssuanceLine.update({
          where: { id: l.id },
          data: { variantId: target!.id, customItemName: null },
        });
      });
      console.log(`    ✓ Migré`);
    } else {
      console.log(`    (dry-run) Aurait migré`);
    }
  }

  console.log(``);
}

main()
  .catch((e) => { console.error('FATAL:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
