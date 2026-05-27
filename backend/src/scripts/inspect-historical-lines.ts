/**
 * Read-only : pour chaque UniformIssuance "historique" (notes contient "historique"),
 * affiche les lignes en distinguant celles avec variantId set vs null (customItemName).
 *
 * Si beaucoup de lignes ont variantId=null, alors computeHoldings() les ignore et
 * la section "Détentions actuelles" sera vide.
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const issuances = await prisma.uniformIssuance.findMany({
    where: {
      OR: [
        { notes: { contains: 'historique', mode: 'insensitive' } },
        { notes: { contains: 'Import historique', mode: 'insensitive' } },
      ],
    },
    include: { lines: { include: { variant: { include: { item: true } } } } },
    orderBy: { issuedAt: 'asc' },
  });

  console.log(`\n📊 ${issuances.length} issuances marquées « Import historique »\n`);

  let totalLines = 0;
  let withVariant = 0;
  let withoutVariant = 0;
  const issuanceStats: { id: string; emp: string; date: string; total: number; variantCount: number; customCount: number; lines: string[] }[] = [];

  for (const iss of issuances) {
    const empName = await prisma.employee
      .findUnique({ where: { id: iss.employeeId }, select: { firstName: true, lastName: true } })
      .then((e) => (e ? `${e.firstName} ${e.lastName}` : '???'));

    let vc = 0, cc = 0;
    const lineDescs: string[] = [];
    for (const l of iss.lines) {
      totalLines++;
      if (l.variantId && l.variant) {
        withVariant++;
        vc++;
        lineDescs.push(`  ✓ ${l.variant.item.name} | ${l.variant.size} | qty=${l.quantity} | $${Number(l.unitCostSnapshot).toFixed(2)}`);
      } else {
        withoutVariant++;
        cc++;
        lineDescs.push(`  ✗ [customItemName] "${l.customItemName}" | qty=${l.quantity} | $${Number(l.unitCostSnapshot).toFixed(2)}  ← INVISIBLE in holdings`);
      }
    }
    issuanceStats.push({
      id: iss.id,
      emp: empName,
      date: iss.issuedAt?.toISOString().slice(0, 10) || '?',
      total: Number(iss.totalLoanCost),
      variantCount: vc,
      customCount: cc,
      lines: lineDescs,
    });
  }

  // Affiche détail
  for (const s of issuanceStats) {
    const flag = s.customCount > 0 ? '⚠' : '✓';
    console.log(`${flag} ${s.date} ${s.emp.padEnd(35)} total=$${s.total.toFixed(2).padStart(7)} variant=${s.variantCount} custom=${s.customCount}`);
    if (s.customCount > 0) {
      for (const ld of s.lines) console.log(ld);
    }
  }

  console.log(`\n====================================================================`);
  console.log(`  Total lignes historiques     : ${totalLines}`);
  console.log(`  Avec variantId (visibles)    : ${withVariant}`);
  console.log(`  Sans variantId (invisibles)  : ${withoutVariant}`);
  console.log(`====================================================================\n`);
  if (withoutVariant > 0) {
    console.log(`⚠ ${withoutVariant} lignes ne s'afficheront PAS dans la section « Détentions actuelles ».`);
    console.log(`   Cause : computeHoldings() ignore les lignes où variantId est null.`);
    console.log(`   Fix possible : (a) afficher les customItemName aussi, (b) résoudre les variants manquants.`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
