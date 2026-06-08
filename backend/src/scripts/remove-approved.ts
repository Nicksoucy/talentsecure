/**
 * Soft-delete (RÉVERSIBLE) des dossiers marqués RETIRER dans le CSV de révision
 * (out-of-quebec-review.csv). À lancer APRÈS validation humaine du CSV : pour
 * garder un dossier, supprime sa ligne (ou change sa décision) dans le CSV avant.
 *
 * Dry-run par défaut. Pour exécuter réellement : ajouter l'argument --apply.
 *   npx ts-node src/scripts/remove-approved.ts            (aperçu)
 *   npx ts-node src/scripts/remove-approved.ts --apply    (suppression)
 *
 * Réversible : remettre isDeleted=false, deletedAt=null restaure un dossier.
 */
import * as fs from 'fs';
import { prisma } from '../config/database';

function parseCsv(path: string): { id: string; section: string; decision: string; nom: string }[] {
  const raw = fs.readFileSync(path, 'utf-8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const rows: { id: string; section: string; decision: string; nom: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    // colonnes : id,section,prenom,nom,ville,codePostal,province,decision,signalCV,lienFiche
    const cells = lines[i].match(/("(?:[^"]|"")*"|[^,]*)/g)!.filter((_, idx) => idx % 2 === 0);
    const unq = (s: string) => (s || '').replace(/^"|"$/g, '').replace(/""/g, '"');
    const id = unq(cells[0]);
    const section = cells[1];
    const nom = `${unq(cells[2])} ${unq(cells[3])}`.trim();
    const decision = cells[7];
    if (id) rows.push({ id, section, decision, nom });
  }
  return rows;
}

async function run() {
  const apply = process.argv.includes('--apply');
  const rows = parseCsv('out-of-quebec-review.csv').filter((r) => r.decision === 'RETIRER');

  const prospectIds = rows.filter((r) => r.section === 'prospect').map((r) => r.id);
  const candidateIds = rows.filter((r) => r.section === 'candidat').map((r) => r.id);

  console.log(`À retirer : ${rows.length} (${prospectIds.length} prospects, ${candidateIds.length} candidats)`);
  rows.forEach((r) => console.log(`  - [${r.section}] ${r.nom}`));

  if (!apply) {
    console.log('\n💡 APERÇU seulement. Relance avec --apply pour soft-delete (réversible).');
    await prisma.$disconnect();
    return;
  }

  const now = new Date();
  let removed = 0;
  if (prospectIds.length) {
    const r = await prisma.prospectCandidate.updateMany({
      where: { id: { in: prospectIds } },
      data: { isDeleted: true, deletedAt: now },
    });
    removed += r.count;
  }
  if (candidateIds.length) {
    const r = await prisma.candidate.updateMany({
      where: { id: { in: candidateIds } },
      data: { isDeleted: true, deletedAt: now },
    });
    removed += r.count;
  }

  await prisma.auditLog.create({
    data: {
      userId: 'system',
      action: 'DELETE',
      resource: 'OutOfQuebecCleanup',
      details: `Soft-delete hors-Québec : ${removed} dossiers (${prospectIds.length} prospects, ${candidateIds.length} candidats)`,
    },
  });

  console.log(`\n✅ ${removed} dossiers soft-deleted (réversible).`);
  await prisma.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
