import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const r = await p.prospectCandidate.findMany({
    where: { isDeleted: false, source: 'form-cv' },
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: { firstName: true, lastName: true, cvUrl: true, videoUrl: true, createdAt: true },
  });
  for (const x of r) {
    console.log(
      x.createdAt.toISOString().slice(0, 16),
      x.firstName,
      x.lastName,
      '| cvUrl:', x.cvUrl ? 'OUI' : 'non',
      '| videoUrl:', x.videoUrl ? 'OUI' : 'non',
    );
  }
  await p.$disconnect();
})();
