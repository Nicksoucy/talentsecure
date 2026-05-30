import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const candidatsActifs = await p.candidate.count({ where: { isDeleted: false } });
  const candidatsActifsNonArchives = await p.candidate.count({ where: { isDeleted: false, isActive: true, isArchived: false } });
  const prospectsVisibles = await p.prospectCandidate.count({ where: { isDeleted: false, isConverted: false } });
  const prospectsConvertis = await p.prospectCandidate.count({ where: { isDeleted: false, isConverted: true } });
  const employes = await p.employee.count({ where: { isDeleted: false } });
  console.log('=== COMPTES RÉELS ===');
  console.log('Candidats (non supprimés)            :', candidatsActifs);
  console.log('Candidats (actifs, non archivés)     :', candidatsActifsNonArchives);
  console.log('Candidats Potentiels (visibles)      :', prospectsVisibles);
  console.log('Prospects convertis (masqués)        :', prospectsConvertis);
  console.log('Employés                             :', employes);
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
