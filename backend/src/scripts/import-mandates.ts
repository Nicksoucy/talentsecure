/**
 * Import des mandats (sites XGuard) depuis l'export Agendrix « Ressources » .xlsx
 * → table `mandates` (couche rose des cartes).
 *
 * DRY-RUN PAR DÉFAUT (aucune écriture) — rapport détaillé sur stdout.
 *
 *   npm run import:mandates -- --file "/chemin/Agendrix - Ressources - ....xlsx"
 *     [--apply]         exécute créations + mises à jour (+ géocodage)
 *     [--skip-geocode]  saute la phase de géocodage (~1,1 s/adresse Nominatim)
 *
 * Dédup par identifiant unique (GAR-001528 / S00136 / TEC-000001). La colonne
 * « Description » (secrets) n'est JAMAIS lue. Idempotent : relancer ne change rien.
 */
import ExcelJS from 'exceljs';
import { prisma } from '../config/database';
import {
  computeMandateUpdate,
  MandateRow,
  MandateSnapshot,
  MandateUpdatePlan,
  normalizeMandateRow,
} from '../utils/mandateImport';
import { geocodeMandateById, invalidateMandateCaches } from '../services/mandateGeocode.service';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const SKIP_GEOCODE = argv.includes('--skip-geocode');
const fileIdx = argv.indexOf('--file');
const FILE = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;

if (!FILE) {
  console.error('Usage: npm run import:mandates -- --file "<xlsx>" [--apply] [--skip-geocode]');
  process.exit(1);
}

/** Valeur de cellule exceljs → texte (gère hyperlink/richText/formule, défensif). */
function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as any;
    if (typeof o.text === 'string') return o.text;
    if (o.text && typeof o.text.richText !== 'undefined') {
      return (o.text.richText || []).map((p: any) => p.text).join('');
    }
    if (Array.isArray(o.richText)) return o.richText.map((p: any) => p.text).join('');
    if (typeof o.result !== 'undefined') return String(o.result ?? '');
    if (typeof o.hyperlink === 'string') return String(o.hyperlink);
    return String(v);
  }
  return String(v);
}

async function readRows(path: string): Promise<MandateRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Classeur vide (aucune feuille)');

  const rows: MandateRow[] = [];
  const skipped: string[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // entêtes
    // Colonnes 1-3 seulement (Nom, Identificateur, Adresse) — la Description (col 4) est ignorée.
    const cells = [cellText(row.getCell(1).value), cellText(row.getCell(2).value), cellText(row.getCell(3).value)];
    const parsed = normalizeMandateRow(cells, rowNumber);
    if ('skipped' in parsed) {
      if (parsed.skipped !== 'ligne vide') skipped.push(`ligne ${rowNumber}: ${parsed.skipped}`);
      return;
    }
    rows.push(parsed);
  });

  if (skipped.length > 0) {
    console.log(`\nIgnorés (${skipped.length}) :`);
    for (const s of skipped) console.log(`  - ${s}`);
  }
  return rows;
}

async function main() {
  console.log(`=== IMPORT MANDATS ${APPLY ? '(APPLICATION)' : '(DRY-RUN — aucune écriture)'} ===`);
  console.log(`Fichier : ${FILE}`);
  const rows = await readRows(FILE!);
  console.log(`Lignes mandat valides : ${rows.length}`);

  // Dédup interne par identifiant (garder la 1re occurrence).
  const seen = new Set<string>();
  const dupes: string[] = [];
  const unique = rows.filter((r) => {
    if (seen.has(r.externalId)) {
      dupes.push(`${r.name} (${r.externalId}, ligne ${r.rowNumber})`);
      return false;
    }
    seen.add(r.externalId);
    return true;
  });
  if (dupes.length > 0) {
    console.log(`\nDoublons d'identifiant dans le fichier (ignorés) : ${dupes.length}`);
    for (const d of dupes) console.log(`  - ${d}`);
  }

  const existing = (await prisma.mandate.findMany({
    where: { isDeleted: false },
    select: {
      id: true,
      externalId: true,
      name: true,
      address: true,
      city: true,
      province: true,
      postalCode: true,
    },
  })) as MandateSnapshot[];
  const byExternalId = new Map(existing.map((m) => [m.externalId, m]));

  const creations: MandateRow[] = [];
  const updates: { existing: MandateSnapshot; row: MandateRow; plan: MandateUpdatePlan }[] = [];
  const unchanged: MandateRow[] = [];

  for (const row of unique) {
    const match = byExternalId.get(row.externalId);
    if (!match) {
      creations.push(row);
      continue;
    }
    const plan = computeMandateUpdate(match, row);
    if (plan) updates.push({ existing: match, row, plan });
    else unchanged.push(row);
  }

  const unplaceable = unique.filter((r) => r.unplaceable);

  // ── Rapport ──────────────────────────────────────────────────────────────
  console.log(`\n─── CRÉATIONS (${creations.length}) ───`);
  for (const c of creations) {
    console.log(`  + ${c.name} (${c.externalId})${c.unplaceable ? ' [SANS ADRESSE — non plaçable]' : ` — ${c.parsed.city ?? '?'}`}`);
  }

  console.log(`\n─── MISES À JOUR (${updates.length}) ───`);
  for (const u of updates) {
    console.log(`  ~ ${u.existing.name} (${u.existing.externalId})`);
    for (const ch of u.plan.changes) console.log(`      ${ch}`);
  }

  console.log(`\n─── INCHANGÉS : ${unchanged.length} ───`);

  console.log(`\n─── NON PLAÇABLES (${unplaceable.length}) — adresse « f »/manquante, pas de pin ───`);
  for (const m of unplaceable) console.log(`  ! ${m.name} (${m.externalId})`);

  // ── Application ──────────────────────────────────────────────────────────
  let errors = 0;
  const geocodeIds: string[] = [];

  if (APPLY) {
    console.log('\n─── APPLICATION ───');
    for (const c of creations) {
      try {
        const created = await prisma.mandate.create({
          data: {
            externalId: c.externalId,
            name: c.name,
            address: c.parsed.address,
            city: c.parsed.city,
            province: c.parsed.province,
            postalCode: c.parsed.postalCode,
          },
        });
        if (!c.unplaceable) geocodeIds.push(created.id);
      } catch (e: any) {
        errors++;
        console.error(`  ✗ création ${c.name} (${c.externalId}): ${e.message}`);
      }
    }
    console.log(`  Créations appliquées : ${creations.length - errors}`);

    for (const u of updates) {
      try {
        await prisma.mandate.update({ where: { id: u.existing.id }, data: u.plan.data });
        if (u.plan.addressChanged && !u.row.unplaceable) geocodeIds.push(u.existing.id);
      } catch (e: any) {
        errors++;
        console.error(`  ✗ mise à jour ${u.existing.name} (${u.existing.externalId}): ${e.message}`);
      }
    }
    console.log(`  Mises à jour appliquées : ${updates.length}`);

    await invalidateMandateCaches();

    if (!SKIP_GEOCODE) {
      // Ajoute les mandats plaçables encore sans coordonnées (rejouable).
      const missing = await prisma.mandate.findMany({
        where: { isDeleted: false, lat: null, NOT: [{ address: null }, { address: '' }] },
        select: { id: true },
      });
      const ids = new Set<string>([...geocodeIds, ...missing.map((m) => m.id)]);

      console.log(`\n─── GÉOCODAGE (${ids.size} mandats, ~1,1 s/adresse) ───`);
      const tally = { address: 0, postal: 0, city: 0, unresolved: 0 };
      let done = 0;
      for (const id of ids) {
        const geo = await geocodeMandateById(id);
        if (geo) tally[geo.source]++;
        else tally.unresolved++;
        done++;
        if (done % 25 === 0) console.log(`  … ${done}/${ids.size}`);
      }
      console.log(
        `  Placés : ${tally.address + tally.postal + tally.city} (adresse ${tally.address}, code postal ${tally.postal}, ville ${tally.city}) — non résolus : ${tally.unresolved}`
      );
    }
  }

  console.log(`\n=== RÉSUMÉ ${APPLY ? '(APPLIQUÉ)' : '(DRY-RUN)'} ===`);
  console.log(`Lignes fichier valides : ${rows.length}`);
  console.log(`  Créations       : ${creations.length}`);
  console.log(`  Mises à jour    : ${updates.length}`);
  console.log(`  Inchangés       : ${unchanged.length}`);
  console.log(`  Non plaçables   : ${unplaceable.length} (adresse « f »/manquante)`);
  if (errors > 0) console.log(`  ERREURS         : ${errors}`);
  if (!APPLY) console.log('\n(Aucune écriture faite. Relancer avec --apply pour exécuter.)');
}

main()
  .catch((e) => {
    console.error('[import-mandates] échec :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
