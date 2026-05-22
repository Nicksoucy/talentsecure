import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const APPLY = process.argv.includes('--apply');

(async () => {
  const emps = await p.employee.findMany({
    where: { isDeleted: false, email: { not: null } },
    select: { id: true, email: true },
  });
  const empEmails = new Set(emps.map((e) => (e.email || '').toLowerCase()).filter(Boolean));

  const cands = await p.candidate.findMany({
    where: { isDeleted: false, email: { not: null } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const leaks = cands.filter((c) => empEmails.has((c.email || '').toLowerCase()));

  console.log(`${leaks.length} candidats à retirer (déjà employés)`);
  leaks.forEach((c) => console.log(`  - ${c.firstName} ${c.lastName} <${c.email}>`));

  if (APPLY && leaks.length) {
    for (const c of leaks) {
      const emp = emps.find((e) => (e.email || '').toLowerCase() === (c.email || '').toLowerCase());
      await p.candidate.update({
        where: { id: c.id },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    }
    console.log(`\n✅ ${leaks.length} candidats retirés.`);
  } else if (!APPLY) {
    console.log('\n(Relancer avec --apply)');
  }
  await p.$disconnect();
})();
