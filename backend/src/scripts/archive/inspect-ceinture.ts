/**
 * READ-ONLY : vérifie si "Ceinture" existe dans la catalogue + ses variants.
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const items = await prisma.uniformItem.findMany({
    where: { name: { contains: 'einture', mode: 'insensitive' } },
    include: { variants: true },
  });
  console.log(`\n📋 Items « Ceinture » dans le catalogue : ${items.length}\n`);
  for (const it of items) {
    console.log(`Item: ${it.name} | division=${it.division} | type=${it.type} | defaultReplacementCost=$${Number(it.defaultReplacementCost).toFixed(2)} | isOneSize=${it.isOneSize}`);
    console.log(`  Variants (${it.variants.length}):`);
    for (const v of it.variants) {
      console.log(`    - id=${v.id} | size=${v.size} | sku=${v.sku ?? '?'} | barcode=${v.barcode} | isActive=${v.isActive} | qtyOnHand=${v.quantityOnHand}`);
    }
  }

  console.log(`\n📋 Tous les items du catalogue :`);
  const all = await prisma.uniformItem.findMany({ include: { variants: { select: { id: true } } }, orderBy: { name: 'asc' } });
  for (const it of all) {
    console.log(`  • ${it.name.padEnd(40)} [${it.division}] $${Number(it.defaultReplacementCost).toFixed(2)} | ${it.variants.length} variants | isOneSize=${it.isOneSize}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
