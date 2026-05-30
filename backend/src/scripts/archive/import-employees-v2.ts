/**
 * Import #2 : roster complet Agendrix (Prénom;Nom;Courriel;Archivé le, Latin-1).
 * Inclut les agents archivés (anciens employés).
 *
 * - Dédup par email contre les employés déjà présents.
 * - status = INACTIF si "Archivé le" rempli, sinon ACTIF.
 * - Matricule extrait du préfixe du prénom ("3221-Yvan", "4099 - SOUKAINA").
 * - Un nouvel employé est retiré de Candidat (soft-delete) et Prospect (masqué).
 *
 * Dry-run par défaut. --apply pour exécuter.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const CSV_PATH = 'C:\\Users\\nicol\\Downloads\\Agendrix_-_employes_-_2026-05-22 (1).csv';

const normEmail = (e?: string | null) => (e || '').trim().toLowerCase();
const cleanName = (s: string) => (s || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

function parseFirstName(raw: string): { firstName: string; matricule: string | null } {
  const m = raw.match(/^(\d{3,6})\s*-\s*(.+)$/);
  if (m) return { firstName: cleanName(m[2]), matricule: m[1] };
  return { firstName: cleanName(raw), matricule: null };
}

async function main() {
  const raw = fs.readFileSync(CSV_PATH, 'latin1');
  const lines = raw.split(/\r?\n/).slice(1);

  interface Row { firstName: string; lastName: string; email: string; matricule: string | null; archived: boolean; }
  const rows: Row[] = [];
  const skippedNoEmail: string[] = [];
  const skippedDept: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(';');
    const { firstName, matricule } = parseFirstName(parts[0] || '');
    const lastName = cleanName(parts[1] || '');
    const email = normEmail(parts[2]);
    const archived = !!(parts[3] && parts[3].trim());

    if (!email) { skippedNoEmail.push(`${firstName} ${lastName}`.trim()); continue; }
    if (lastName.toLowerCase() === 'xguard') { skippedDept.push(`${firstName} ${lastName} <${email}>`); continue; }
    rows.push({ firstName, lastName, email, matricule, archived });
  }

  // Dédup interne par email (garder la 1re occurrence)
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(r.email) ? false : (seen.add(r.email), true)));

  // Pré-charger emails employés existants (dédup contre import #1)
  const existingEmps = await prisma.employee.findMany({
    where: { isDeleted: false, email: { not: null } },
    select: { email: true },
  });
  const existingEmpEmails = new Set(existingEmps.map((e) => normEmail(e.email)));

  // Pré-charger candidats & prospects par email
  const candidates = await prisma.candidate.findMany({
    where: { isDeleted: false, email: { not: null } },
    select: { id: true, email: true, phone: true, city: true, address: true, province: true,
              postalCode: true, hasBSP: true, bspNumber: true, hasVehicle: true,
              cvUrl: true, cvStoragePath: true, videoUrl: true, videoStoragePath: true, hrNotes: true },
  });
  const candByEmail = new Map(candidates.map((c) => [normEmail(c.email), c]));
  const prospects = await prisma.prospectCandidate.findMany({
    where: { isDeleted: false, isConverted: false, email: { not: null } },
    select: { id: true, email: true, phone: true, city: true, cvUrl: true },
  });
  const prospByEmail = new Map(prospects.map((p) => [normEmail(p.email), p]));

  let created = 0, linkedCand = 0, linkedProsp = 0, alreadyEmp = 0, newOnly = 0, errors = 0;
  let actif = 0, inactif = 0;

  for (const r of unique) {
    if (existingEmpEmails.has(r.email)) { alreadyEmp++; continue; }
    try {
      const cand = candByEmail.get(r.email);
      const prosp = prospByEmail.get(r.email);
      if (cand) linkedCand++; else if (prosp) linkedProsp++; else newOnly++;
      if (r.archived) inactif++; else actif++;

      if (APPLY) {
        await prisma.$transaction(async (tx) => {
          await tx.employee.create({
            data: {
              firstName: r.firstName,
              lastName: r.lastName,
              email: r.email,
              phone: cand?.phone || prosp?.phone || '',
              employeeNumber: r.matricule,
              status: r.archived ? 'INACTIF' : 'ACTIF',
              city: cand?.city || prosp?.city || null,
              address: cand?.address || null,
              province: cand?.province || 'QC',
              postalCode: cand?.postalCode || null,
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
          if (prosp) {
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

  console.log(`\n=== IMPORT #2 ${APPLY ? '(APPLIQUÉ)' : '(DRY-RUN)'} ===`);
  console.log(`Lignes valides (email) : ${unique.length}`);
  console.log(`  -> ${alreadyEmp} déjà employés (ignorés, dédup)`);
  console.log(`  -> ${created} NOUVEAUX employés ajoutés`);
  console.log(`       dont ${linkedCand} ex-Candidats (retirés), ${linkedProsp} ex-Prospects (masqués), ${newOnly} sans correspondance`);
  console.log(`       statut: ${actif} ACTIF, ${inactif} INACTIF (archivés)`);
  console.log(`  -> ${errors} erreurs`);
  console.log(`Ignorés sans email : ${skippedNoEmail.length}`);
  console.log(`Ignorés comptes département : ${skippedDept.length} ${skippedDept.length ? '['+skippedDept.join(', ')+']' : ''}`);
  if (!APPLY) console.log(`\n(Relancer avec --apply pour exécuter)`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
