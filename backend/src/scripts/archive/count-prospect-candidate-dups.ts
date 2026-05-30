import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function normPhone(p?: string | null) {
  return (p || '').replace(/\D/g, '').slice(-10); // 10 derniers chiffres
}
function normEmail(e?: string | null) {
  return (e || '').trim().toLowerCase();
}

async function main() {
  const candidates = await prisma.candidate.findMany({
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });
  const candEmails = new Map<string, string>();
  const candPhones = new Map<string, string>();
  for (const c of candidates) {
    const e = normEmail(c.email);
    const p = normPhone(c.phone);
    if (e) candEmails.set(e, c.id);
    if (p) candPhones.set(p, c.id);
  }

  const prospects = await prisma.prospectCandidate.findMany({
    where: { isDeleted: false },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, isConverted: true },
  });

  let visibleDup = 0;   // prospect VISIBLE (non converti) qui matche un candidat -> le bug
  let convertedDup = 0; // prospect deja converti qui matche un candidat (normal)
  const examples: string[] = [];

  for (const p of prospects) {
    const e = normEmail(p.email);
    const ph = normPhone(p.phone);
    const matchId = (e && candEmails.get(e)) || (ph && candPhones.get(ph)) || null;
    if (!matchId) continue;
    if (p.isConverted) {
      convertedDup++;
    } else {
      visibleDup++;
      if (examples.length < 15) {
        examples.push(`  - ${p.firstName} ${p.lastName} (${p.email || p.phone}) -> candidat ${matchId}`);
      }
    }
  }

  console.log(`\nCandidats (Candidat): ${candidates.length}`);
  console.log(`Prospects visibles (non supprimes): ${prospects.length}`);
  console.log(`\n>>> Prospects VISIBLES qui sont deja des Candidats (LE BUG): ${visibleDup}`);
  console.log(`    Prospects deja marques converti qui matchent un candidat (OK): ${convertedDup}`);
  console.log(`\nExemples de doublons visibles a corriger:`);
  console.log(examples.join('\n') || '  (aucun)');

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
