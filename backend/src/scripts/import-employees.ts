/**
 * Importe la liste d'employés (export Agendrix : Prénom;Nom;Courriel, Latin-1).
 *
 * Pour chaque employé :
 *  - Crée une fiche Employee (dédup par email).
 *  - Si un Candidat correspond (par email) -> copie CV/téléphone/ville,
 *    lie (convertedFromCandidateId) et soft-delete le candidat.
 *  - Si un Prospect correspond (par email) -> le marque converti + masqué.
 *
 * Dry-run par défaut. Appliquer avec --apply.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const CSV_PATH = 'C:\\Users\\nicol\\Downloads\\Agendrix_-_employes_-_2026-05-19(Sheet1).csv';

const normEmail = (e?: string | null) => (e || '').trim().toLowerCase();
// Nettoie les annotations entre parenthèses en fin de nom : "(EE)", "(vaccinée)"…
const cleanName = (s: string) => (s || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

async function main() {
  const raw = fs.readFileSync(CSV_PATH, 'latin1');
  const lines = raw.split(/\r?\n/).slice(1); // sauter l'en-tête

  interface Row { firstName: string; lastName: string; email: string; }
  const rows: Row[] = [];
  const skippedNoEmail: string[] = [];
  const skippedDept: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(';');
    const firstName = cleanName(parts[0] || '');
    const lastName = cleanName(parts[1] || '');
    const email = normEmail(parts[2]);

    if (!email) { skippedNoEmail.push(`${firstName} ${lastName}`.trim()); continue; }
    // Comptes de département / non-personnes (RH, Comptabilité, Opérations, Formation XGuard)
    if (lastName.toLowerCase() === 'xguard') { skippedDept.push(`${firstName} ${lastName} <${email}>`); continue; }

    rows.push({ firstName, lastName, email });
  }

  // Dédup interne par email
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(r.email) ? false : (seen.add(r.email), true)));

  // Pré-charger candidats & prospects par email
  const candidates = await prisma.candidate.findMany({
    where: { isDeleted: false },
    select: { id: true, email: true, phone: true, city: true, address: true, province: true,
              postalCode: true, hasBSP: true, bspNumber: true, hasVehicle: true,
              cvUrl: true, cvStoragePath: true, videoUrl: true, videoStoragePath: true, hrNotes: true },
  });
  const candByEmail = new Map(candidates.filter(c => c.email).map(c => [normEmail(c.email), c]));

  let created = 0, linkedCand = 0, linkedProsp = 0, alreadyEmp = 0, newOnly = 0, errors = 0;
  const matchedSample: string[] = [];
  const newSample: string[] = [];

  for (const r of unique) {
    try {
      // Déjà employé ?
      const existingEmp = await prisma.employee.findFirst({
        where: { isDeleted: false, email: { equals: r.email, mode: 'insensitive' } },
        select: { id: true },
      });
      if (existingEmp) { alreadyEmp++; continue; }

      const cand = candByEmail.get(r.email);
      const prosp = await prisma.prospectCandidate.findFirst({
        where: { isDeleted: false, email: { equals: r.email, mode: 'insensitive' } },
        select: { id: true, phone: true, city: true, cvUrl: true, isConverted: true },
      });

      if (cand) { linkedCand++; if (matchedSample.length < 10) matchedSample.push(`${r.firstName} ${r.lastName} <${r.email}> (candidat)`); }
      else if (prosp) { linkedProsp++; if (matchedSample.length < 10) matchedSample.push(`${r.firstName} ${r.lastName} <${r.email}> (prospect)`); }
      else { newOnly++; if (newSample.length < 10) newSample.push(`${r.firstName} ${r.lastName} <${r.email}>`); }

      if (APPLY) {
        await prisma.$transaction(async (tx) => {
          await tx.employee.create({
            data: {
              firstName: r.firstName,
              lastName: r.lastName,
              email: r.email,
              phone: cand?.phone || prosp?.phone || '',
              city: cand?.city || prosp?.city || null,
              address: cand?.address || null,
              province: cand?.province || 'QC',
              postalCode: cand?.postalCode || null,
              status: 'ACTIF',
              hasBSP: cand?.hasBSP ?? false,
              bspNumber: cand?.bspNumber || null,
              hasVehicle: cand?.hasVehicle ?? false,
              cvUrl: cand?.cvUrl || prosp?.cvUrl || null,
              cvStoragePath: cand?.cvStoragePath || null,
              videoUrl: cand?.videoUrl || null,
              videoStoragePath: cand?.videoStoragePath || null,
              notes: cand?.hrNotes || null,
              convertedFromCandidateId: cand?.id || null,
            },
          });
          if (cand) {
            await tx.candidate.update({ where: { id: cand.id }, data: { isDeleted: true, deletedAt: new Date() } });
          }
          if (prosp && !prosp.isConverted) {
            await tx.prospectCandidate.update({
              where: { id: prosp.id },
              data: { isConverted: true, convertedAt: new Date(), convertedToId: cand?.id || null },
            });
          }
        });
      }
      created++;
    } catch (e: any) {
      errors++;
      console.error(`Erreur ${r.firstName} ${r.lastName}: ${e.message}`);
    }
  }

  console.log(`\n=== IMPORT EMPLOYÉS ${APPLY ? '(APPLIQUÉ)' : '(DRY-RUN)'} ===`);
  console.log(`Lignes employés valides (email présent) : ${unique.length}`);
  console.log(`  -> ${linkedCand} liés à un Candidat existant (candidat retiré)`);
  console.log(`  -> ${linkedProsp} liés à un Prospect existant (prospect masqué)`);
  console.log(`  -> ${newOnly} nouveaux employés sans correspondance`);
  console.log(`  -> ${alreadyEmp} déjà employés (ignorés)`);
  console.log(`  -> ${errors} erreurs`);
  console.log(`Ignorés sans email (non-personnes) : ${skippedNoEmail.length} ${skippedNoEmail.length ? '['+skippedNoEmail.join(', ')+']' : ''}`);
  console.log(`Ignorés comptes département XGuard : ${skippedDept.length} ${skippedDept.length ? '['+skippedDept.join(', ')+']' : ''}`);
  console.log(`\nExemples correspondances:\n  ${matchedSample.join('\n  ')}`);
  console.log(`\nExemples nouveaux employés:\n  ${newSample.join('\n  ')}`);
  if (!APPLY) console.log(`\n(Relancer avec --apply pour exécuter)`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
