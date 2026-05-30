import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function countNewCvs() {
  const total = await prisma.prospectCandidate.count({
    where: { isDeleted: false },
  });
  const withCv = await prisma.prospectCandidate.count({
    where: { isDeleted: false, cvUrl: { not: null } },
  });

  console.log(`\n📊 TOTAL prospects (non supprimés): ${total}`);
  console.log(`📄 Prospects avec CV: ${withCv}\n`);

  // Répartition des prospects AVEC CV par semaine de création
  const rows = await prisma.prospectCandidate.findMany({
    where: { isDeleted: false, cvUrl: { not: null } },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  const byDay = new Map<string, number>();
  for (const r of rows) {
    const key = r.createdAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  console.log('🗓️  CVs ajoutés par jour (30 derniers jours avec activité):\n');
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  let cumul = 0;
  for (const [day, n] of days.slice(0, 30)) {
    cumul += n;
    console.log(`   ${day} : +${n}  (cumul depuis le haut: ${cumul})`);
  }

  // Bornes utiles
  const now = new Date();
  for (const days of [7, 14, 30, 60]) {
    const since = new Date(now.getTime() - days * 24 * 3600 * 1000);
    const n = await prisma.prospectCandidate.count({
      where: { isDeleted: false, cvUrl: { not: null }, createdAt: { gte: since } },
    });
    console.log(`\n   → ${n} CVs ajoutés dans les ${days} derniers jours`);
  }

  await prisma.$disconnect();
}

countNewCvs().catch((e) => {
  console.error('Erreur:', e);
  process.exit(1);
});
