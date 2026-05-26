// One-shot : ajuste les ceintures S/M/L à 61/60/60 = 181 total (Excel inventaire).
import { PrismaClient } from '@prisma/client';
import { applyMovement } from '../services/uniform-stock.service';

const prisma = new PrismaClient();

const TARGETS: Record<'S' | 'M' | 'L', number> = { S: 61, M: 60, L: 60 };

async function main() {
  const belt = await prisma.uniformItem.findFirst({
    where: { division: 'SECURITE', name: { contains: 'einture' } },
    include: { variants: { where: { size: { in: ['S', 'M', 'L'] } } } },
  });
  if (!belt) throw new Error('Ceinture introuvable');

  console.log('\n=== AVANT ===');
  for (const v of belt.variants) {
    console.log(`  ${v.size.padEnd(2)} qty=${v.quantityOnHand}`);
  }

  for (const v of belt.variants) {
    const target = TARGETS[v.size as 'S' | 'M' | 'L'];
    const delta = target - v.quantityOnHand;
    if (delta === 0) {
      console.log(`\n→ ${v.size} : déjà à ${target}, rien à faire`);
      continue;
    }
    console.log(`\n→ ${v.size} : ${v.quantityOnHand} → ${target} (delta ${delta >= 0 ? '+' : ''}${delta})`);
    await prisma.$transaction(async (tx) => {
      await applyMovement(tx, {
        variantId: v.id,
        type: 'ADJUST',
        quantity: delta,
        reason: `Rééquilibrage ceintures S/M/L = 1/3 chacun (Excel inventaire 181 total)`,
      });
    });
  }

  const after = await prisma.uniformVariant.findMany({
    where: { itemId: belt.id, size: { in: ['S', 'M', 'L'] } },
    orderBy: { size: 'asc' },
  });
  console.log('\n=== APRÈS ===');
  let total = 0;
  for (const v of after) {
    console.log(`  ${v.size.padEnd(2)} qty=${v.quantityOnHand}`);
    total += v.quantityOnHand;
  }
  console.log(`\n  Total : ${total}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
