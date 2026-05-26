// One-shot : ceintures = S, M, L uniquement.
// Transfère le stock des variantes non-S/M/L vers la grandeur S ou L (selon mapping),
// puis désactive les variantes obsolètes. L'historique des mouvements est préservé
// (rien n'est supprimé — on insère des ADJUST de réconciliation).
import { PrismaClient } from '@prisma/client';
import { applyMovement } from '../services/uniform-stock.service';

const prisma = new PrismaClient();

// Mapping toutes-grandeurs → S/M/L
const MAPPING: Record<string, 'S' | 'M' | 'L'> = {
  XS: 'S',
  XL: 'L',
  '2XL': 'L',
  '3XL': 'L',
  '4XL': 'L',
  '5XL': 'L',
};

async function main() {
  const belt = await prisma.uniformItem.findFirst({
    where: { division: 'SECURITE', name: { contains: 'einture' } },
    include: { variants: true },
  });
  if (!belt) throw new Error('Item Ceinture introuvable');

  const bySize = new Map(belt.variants.map((v) => [v.size, v]));
  for (const target of ['S', 'M', 'L']) {
    if (!bySize.has(target)) throw new Error(`Variante cible ${target} manquante`);
  }

  console.log('\n=== AVANT ===');
  for (const v of belt.variants) {
    console.log(`  ${v.size.padEnd(8)} qty=${v.quantityOnHand} active=${v.isActive}`);
  }

  for (const [srcSize, targetSize] of Object.entries(MAPPING)) {
    const src = bySize.get(srcSize);
    if (!src) continue;
    const tgt = bySize.get(targetSize)!;
    const qty = src.quantityOnHand;

    if (qty > 0) {
      console.log(`\n→ Transfert ${qty} × Ceinture ${srcSize} → ${targetSize}`);
      // Décrémente la source (OUT — la stocke comme "consolidation")
      await prisma.$transaction(async (tx) => {
        await applyMovement(tx, {
          variantId: src.id,
          type: 'ADJUST',
          quantity: -qty,
          reason: `Consolidation ceintures S/M/L : transfert ${srcSize} → ${targetSize}`,
        });
        await applyMovement(tx, {
          variantId: tgt.id,
          type: 'ADJUST',
          quantity: qty,
          reason: `Consolidation ceintures S/M/L : reçu de ${srcSize}`,
        });
      });
    }

    // Désactive la variante source (les mouvements/lignes restent attachés pour l'historique)
    await prisma.uniformVariant.update({
      where: { id: src.id },
      data: { isActive: false },
    });
    console.log(`  ✓ ${srcSize} désactivée`);
  }

  // Vérification finale
  const after = await prisma.uniformItem.findUnique({
    where: { id: belt.id },
    include: {
      variants: { orderBy: { size: 'asc' } },
    },
  });
  console.log('\n=== APRÈS ===');
  for (const v of after!.variants) {
    console.log(`  ${v.size.padEnd(8)} qty=${v.quantityOnHand} active=${v.isActive}`);
  }

  console.log('\n✓ Consolidation terminée.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
