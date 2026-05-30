import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

(async () => {
  const totalSurvey = await p.prospectCandidate.count({ where: { isDeleted: false, source: 'survey-video' } });
  const withVideo = await p.prospectCandidate.count({ where: { isDeleted: false, source: 'survey-video', videoStoragePath: { not: null } } });
  const withGhlSub = await p.prospectCandidate.count({ where: { isDeleted: false, ghlSubmissionId: { not: null } } });

  const recent = await p.prospectCandidate.findMany({
    where: { isDeleted: false, source: 'survey-video' },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: { firstName: true, lastName: true, createdAt: true, videoStoragePath: true, ghlSubmissionId: true },
  });

  console.log('=== ÉTAT SYNCHRO SURVEY ===');
  console.log('Prospects source=survey-video      :', totalSurvey);
  console.log('  dont avec vidéo stockée (R2)     :', withVideo);
  console.log('Prospects avec ghlSubmissionId     :', withGhlSub);
  console.log('\n8 plus récents (survey-video) :');
  for (const r of recent) {
    console.log(`  ${r.createdAt.toISOString().slice(0,16)}  ${r.firstName} ${r.lastName}  vidéo=${r.videoStoragePath ? 'OUI' : 'non'}`);
  }
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
