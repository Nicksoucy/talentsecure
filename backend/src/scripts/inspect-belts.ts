// One-shot : inspecte l'état actuel des ceintures (toutes divisions confondues).
// Affiche : variantes, stock, mouvements, lignes de remise/retour.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const items = await prisma.uniformItem.findMany({
    where: { name: { contains: 'einture' } },
    include: {
      variants: {
        include: {
          _count: { select: { movements: true, issuanceLines: true, returnLines: true } },
        },
        orderBy: { size: 'asc' },
      },
    },
  });

  for (const item of items) {
    console.log(`\n=== ${item.division} / ${item.name} (id=${item.id}) ===`);
    for (const v of item.variants) {
      console.log(
        `  • size=${v.size.padEnd(8)} qty=${String(v.quantityOnHand).padStart(3)} ` +
        `cost=${v.replacementCost} active=${v.isActive} ` +
        `mvts=${v._count.movements} issLines=${v._count.issuanceLines} retLines=${v._count.returnLines} ` +
        `barcode=${v.barcode}`
      );
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
