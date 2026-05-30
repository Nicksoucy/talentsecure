import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const emp = await p.employee.count({ where: { isDeleted: false } });
  const cand = await p.candidate.count({ where: { isDeleted: false } });
  const prosp = await p.prospectCandidate.count({ where: { isDeleted: false, isConverted: false } });
  const emps = await p.employee.findMany({ where: { isDeleted: false, email: { not: null } }, select: { email: true } });
  let leak = 0;
  for (const e of emps) {
    const em = (e.email || '').toLowerCase();
    if (!em) continue;
    const c = await p.candidate.findFirst({ where: { isDeleted: false, email: { equals: em, mode: 'insensitive' } } });
    if (c) leak++;
  }
  console.log('Employes actifs   :', emp);
  console.log('Candidats actifs  :', cand);
  console.log('Prospects visibles:', prosp);
  console.log('Fuites (employe encore candidat actif):', leak);
  await p.$disconnect();
})();
