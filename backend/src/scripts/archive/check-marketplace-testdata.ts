import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const EVAL = { isDeleted: false, isActive: true, isArchived: false, status: { in: ['QUALIFIE', 'BON', 'TRES_BON', 'EXCELLENT', 'ELITE'] as any } };
(async () => {
  const totalEval = await p.candidate.count({ where: EVAL });
  const withVideo = await p.candidate.findFirst({
    where: { ...EVAL, videoStoragePath: { not: null } },
    select: { id: true, firstName: true, lastName: true, city: true, clientNote: true },
  });
  console.log('Candidats évalués visibles marketplace :', totalEval);
  if (withVideo) {
    console.log('Exemple AVEC vidéo :', withVideo.firstName, withVideo.lastName, '—', withVideo.city);
    console.log('  id:', withVideo.id);
    console.log('  note client:', withVideo.clientNote || '(vide)');
  } else {
    console.log('Aucun candidat évalué avec vidéo (le badge Vidéo n\'apparaîtra pas).');
  }
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
