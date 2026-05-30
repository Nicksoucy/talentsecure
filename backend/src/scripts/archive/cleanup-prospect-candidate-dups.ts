/**
 * Nettoie les doublons : tout prospect VISIBLE (non converti, non supprimé)
 * qui correspond à un Candidat existant est marqué converti + lié au candidat,
 * pour qu'il disparaisse des Candidats Potentiels. LE CANDIDAT GAGNE TOUJOURS.
 *
 * Dry-run par défaut. Pour appliquer : ajouter l'argument --apply
 *   npx ts-node src/scripts/cleanup-prospect-candidate-dups.ts          (aperçu)
 *   npx ts-node src/scripts/cleanup-prospect-candidate-dups.ts --apply  (exécute)
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

const normEmail = (e?: string | null) => (e || '').trim().toLowerCase();
const normPhone = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-10);

async function main() {
  const candidates = await prisma.candidate.findMany({
    where: { isDeleted: false },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });
  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();
  for (const c of candidates) {
    const e = normEmail(c.email);
    const p = normPhone(c.phone);
    if (e) byEmail.set(e, c.id);
    if (p.length === 10) byPhone.set(p, c.id);
  }

  const prospects = await prisma.prospectCandidate.findMany({
    where: { isDeleted: false, isConverted: false },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });

  const toFix: { prospectId: string; candidateId: string; label: string }[] = [];
  for (const p of prospects) {
    const e = normEmail(p.email);
    const ph = normPhone(p.phone);
    const candidateId = (e && byEmail.get(e)) || (ph.length === 10 && byPhone.get(ph)) || null;
    if (candidateId) {
      toFix.push({
        prospectId: p.id,
        candidateId,
        label: `${p.firstName} ${p.lastName} (${p.email || p.phone})`,
      });
    }
  }

  console.log(`\n${toFix.length} doublons visibles à corriger`);
  console.log(APPLY ? '>>> MODE APPLICATION\n' : '>>> DRY-RUN (aperçu seulement, rien n\'est modifié)\n');
  toFix.forEach((f, i) => console.log(`  ${i + 1}. ${f.label} -> candidat ${f.candidateId}`));

  if (APPLY && toFix.length > 0) {
    let done = 0;
    for (const f of toFix) {
      await prisma.prospectCandidate.update({
        where: { id: f.prospectId },
        data: { isConverted: true, convertedAt: new Date(), convertedToId: f.candidateId },
      });
      done++;
    }
    console.log(`\n✅ ${done} prospects marqués converti + liés au candidat.`);
  } else if (!APPLY) {
    console.log(`\n(Relancer avec --apply pour exécuter)`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
