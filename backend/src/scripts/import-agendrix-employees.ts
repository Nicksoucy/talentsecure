/**
 * Sync d'un roster Agendrix (export « Agendrix - employés » .xlsx) → TalentSecure.
 * XGuard a DEUX comptes Agendrix : sécurité (agents) et signalisation
 * (signaleurs). Chaque fichier fait foi pour « qui est ACTIF dans CE métier »
 * seulement — un signaleur absent du fichier sécurité n'est jamais désactivé.
 *
 * DRY-RUN PAR DÉFAUT (aucune écriture) — rapport détaillé sur stdout.
 *
 *   npm run import:agendrix -- --file "/chemin/Agendrix_-_employes_-_2026-07-17.xlsx"
 *     [--apply]              exécute créations + mises à jour (+ géocodage)
 *     [--deactivate-missing] passe INACTIF les employés ACTIF absents du fichier
 *                            (via la MÊME logique d'offboarding uniformes que l'UI)
 *     [--reactivate]         repasse ACTIF les employés INACTIF présents au fichier
 *     [--skip-geocode]       saute la phase de géocodage (~1,1 s/adresse Nominatim)
 *     [--division securite|signalisation]
 *                            métier du fichier (défaut : securite). Présent au
 *                            fichier → métier ajouté ; créé avec ce métier ;
 *                            réactivé avec ce métier seulement. Absent du
 *                            fichier (--deactivate-missing) → si l'employé a
 *                            aussi l'autre métier, on retire seulement celui-ci
 *                            (il reste ACTIF) ; sinon désactivation.
 *     --by <courriel>        OBLIGATOIRE avec --apply : la personne qui lance
 *                            l'import, inscrite au registre de chaque
 *                            désactivation / réactivation
 *
 * Colonnes lues par leur ENTÊTE (l'ordre change d'un export à l'autre).
 * Matching : courriel (insensible casse) puis téléphones (10 derniers chiffres) —
 * mêmes sémantiques que utils/candidateMatch. Un employé déjà réclamé par une
 * autre ligne → AMBIGU (aucune écriture). Lignes sans courriel ni téléphone →
 * REVUE MANUELLE. Idempotent : relancer ne change rien (UNCHANGED).
 */
import path from 'path';
import ExcelJS from 'exceljs';
import { prisma } from '../config/database';
import { lastTenDigits } from '../utils/phone';
import {
  AgendrixRow,
  buildAgendrixColumnMap,
  computeEmployeeUpdate,
  DIVISION_LABEL,
  divisionsWithAdded,
  EmployeeDivision,
  EmployeeSnapshot,
  normalizeAgendrixRow,
  parseDivisionArg,
  planMissingEmployee,
  toCanonicalCells,
  UpdatePlan,
} from '../utils/agendrixImport';
import {
  buildDeactivationFields,
  propagateUniformOffboarding,
  revertUniformOffboarding,
} from '../services/employee-offboarding.service';
import {
  EMPLOYEE_MAPPOINTS_CACHE_KEY,
  geocodeEmployeeById,
} from '../services/addressGeocode.service';
import { invalidateCaches } from '../utils/cacheInvalidation';
import { recordEmployeeAudit } from '../services/audit.service';

// ── Arguments ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const DEACTIVATE_MISSING = argv.includes('--deactivate-missing');
const REACTIVATE = argv.includes('--reactivate');
const SKIP_GEOCODE = argv.includes('--skip-geocode');
const fileIdx = argv.indexOf('--file');
const FILE = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
const byIdx = argv.indexOf('--by');
const BY_EMAIL = byIdx >= 0 ? argv[byIdx + 1]?.trim() : undefined;
const divIdx = argv.indexOf('--division');
const DIVISION = parseDivisionArg(divIdx >= 0 ? argv[divIdx + 1] : undefined);

if (!FILE || (APPLY && !BY_EMAIL) || !DIVISION) {
  console.error(
    'Usage: npm run import:agendrix -- --file "<xlsx>" [--division securite|signalisation] [--apply --by <courriel>] [--deactivate-missing] [--reactivate] [--skip-geocode]'
  );
  if (FILE && APPLY && !BY_EMAIL) console.error('--apply exige --by <courriel> : la personne qui lance l\'import (registre).');
  if (!DIVISION) console.error('--division : « securite » ou « signalisation ».');
  process.exit(1);
}
const DIV: EmployeeDivision = DIVISION;
const DIV_LABEL = DIVISION_LABEL[DIV];

// ── Types locaux ────────────────────────────────────────────────────────────
interface EmployeeRow extends EmployeeSnapshot {
  divisions: EmployeeDivision[];
  terminationDate: Date | null;
  uniformReturnDeadlineAt: Date | null;
  lat: number | null;
}

interface CandidateRow {
  id: string;
  email: string | null;
  phone: string;
  city: string;
  address: string | null;
  province: string;
  postalCode: string | null;
  hasBSP: boolean;
  bspNumber: string | null;
  bspExpiryDate: Date | null;
  hasVehicle: boolean;
  cvUrl: string | null;
  cvStoragePath: string | null;
  videoUrl: string | null;
  videoStoragePath: string | null;
  hrNotes: string | null;
}

interface ProspectRow {
  id: string;
  email: string | null;
  phone: string;
  city: string | null;
  streetAddress: string | null;
  province: string | null;
  postalCode: string | null;
  cvUrl: string | null;
  cvStoragePath: string | null;
  videoUrl: string | null;
  videoStoragePath: string | null;
  notes: string | null;
}

const label = (r: AgendrixRow) =>
  `${r.firstName} ${r.lastName}${r.email ? ` <${r.email}>` : ''} (ligne ${r.rowNumber})`;
const empLabel = (e: EmployeeSnapshot) =>
  `${e.firstName} ${e.lastName}${e.email ? ` <${e.email}>` : ''}`;

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
    if (typeof o.hyperlink === 'string') return String(o.hyperlink).replace(/^mailto:/, '');
    return String(v);
  }
  return String(v);
}

async function readRows(path: string): Promise<AgendrixRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Classeur vide (aucune feuille)');

  // Colonnes retrouvées par leur entête : l'ordre change d'un export à l'autre.
  const headerRow = ws.getRow(1);
  const headers = Array.from({ length: ws.columnCount }, (_, i) =>
    cellText(headerRow.getCell(i + 1).value).trim()
  );
  const columns = buildAgendrixColumnMap(headers);
  console.log(
    `Colonnes : courriel ${columns.email != null ? 'oui' : 'NON'} · adresse ${columns.address != null ? 'oui' : 'NON'} · téléphones ${columns.phones.length}`
  );

  const rows: AgendrixRow[] = [];
  const skipped: string[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // entêtes
    const raw = Array.from({ length: headers.length }, (_, i) => cellText(row.getCell(i + 1).value));
    const parsed = normalizeAgendrixRow(toCanonicalCells(columns, raw), rowNumber);
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
  console.log(`=== IMPORT AGENDRIX ${APPLY ? '(APPLICATION)' : '(DRY-RUN — aucune écriture)'} ===`);
  console.log(`Fichier : ${FILE}`);
  console.log(`Métier du fichier : ${DIV_LABEL} (${DIV})`);
  // Auteur inscrit au registre : vérifié AVANT toute écriture.
  let actorId: string | null = null;
  if (APPLY) {
    const actor = await prisma.user.findFirst({
      where: { email: { equals: BY_EMAIL!, mode: 'insensitive' } },
      select: { id: true, email: true },
    });
    if (!actor) throw new Error(`--by : aucun utilisateur TalentSecure avec le courriel « ${BY_EMAIL} »`);
    actorId = actor.id;
    console.log(`Lancé par : ${actor.email}`);
  }
  const fileName = path.basename(FILE!);
  const rows = await readRows(FILE!);
  console.log(`Lignes employé valides : ${rows.length}`);

  // ── Préchargements (matching O(1) par ligne) ─────────────────────────────
  const employees = (await prisma.employee.findMany({
    where: { isDeleted: false },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      province: true,
      postalCode: true,
      status: true,
      employeeNumber: true,
      divisions: true,
      terminationDate: true,
      uniformReturnDeadlineAt: true,
      lat: true,
    },
  })) as unknown as EmployeeRow[];

  const empByEmail = new Map<string, EmployeeRow>();
  const empByPhone = new Map<string, EmployeeRow>();
  for (const e of employees) {
    const em = (e.email || '').trim().toLowerCase();
    if (em && !empByEmail.has(em)) empByEmail.set(em, e);
    const ten = lastTenDigits(e.phone);
    if (ten.length === 10 && !empByPhone.has(ten)) empByPhone.set(ten, e);
  }

  const candidates = (await prisma.candidate.findMany({
    where: { isDeleted: false },
    select: {
      id: true,
      email: true,
      phone: true,
      city: true,
      address: true,
      province: true,
      postalCode: true,
      hasBSP: true,
      bspNumber: true,
      bspExpiryDate: true,
      hasVehicle: true,
      cvUrl: true,
      cvStoragePath: true,
      videoUrl: true,
      videoStoragePath: true,
      hrNotes: true,
    },
  })) as CandidateRow[];
  const candByEmail = new Map<string, CandidateRow>();
  const candByPhone = new Map<string, CandidateRow>();
  for (const c of candidates) {
    const em = (c.email || '').trim().toLowerCase();
    if (em && !candByEmail.has(em)) candByEmail.set(em, c);
    const ten = lastTenDigits(c.phone);
    if (ten.length === 10 && !candByPhone.has(ten)) candByPhone.set(ten, c);
  }

  const prospects = (await prisma.prospectCandidate.findMany({
    where: { isDeleted: false, isConverted: false },
    select: {
      id: true,
      email: true,
      phone: true,
      city: true,
      streetAddress: true,
      province: true,
      postalCode: true,
      cvUrl: true,
      cvStoragePath: true,
      videoUrl: true,
      videoStoragePath: true,
      notes: true,
    },
  })) as ProspectRow[];
  const prospByEmail = new Map<string, ProspectRow>();
  const prospByPhone = new Map<string, ProspectRow>();
  for (const p of prospects) {
    const em = (p.email || '').trim().toLowerCase();
    if (em && !prospByEmail.has(em)) prospByEmail.set(em, p);
    const ten = lastTenDigits(p.phone);
    if (ten.length === 10 && !prospByPhone.has(ten)) prospByPhone.set(ten, p);
  }

  // Indice « nom identique » pour la revue manuelle (jamais écrit).
  const normFull = (a: string, b: string) =>
    `${a} ${b}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z]/g, '');
  const empByName = new Map<string, EmployeeRow[]>();
  for (const e of employees) {
    const k = normFull(e.firstName, e.lastName);
    if (!empByName.has(k)) empByName.set(k, []);
    empByName.get(k)!.push(e);
  }

  // ── Matching + classement ────────────────────────────────────────────────
  const claimed = new Map<string, AgendrixRow>(); // employeeId → 1re ligne qui l'a réclamé
  const updates: { emp: EmployeeRow; row: AgendrixRow; plan: UpdatePlan }[] = [];
  const unchanged: { emp: EmployeeRow; row: AgendrixRow }[] = [];
  const reactivations: { emp: EmployeeRow; row: AgendrixRow; plan: UpdatePlan | null }[] = [];
  const creations: { row: AgendrixRow; cand: CandidateRow | null; prosp: ProspectRow | null }[] = [];
  const ambiguous: { row: AgendrixRow; emp: EmployeeRow; firstRow: AgendrixRow }[] = [];
  const manualReview: { row: AgendrixRow; hints: EmployeeRow[] }[] = [];
  const warnings: string[] = [];

  for (const row of rows) {
    let emp: EmployeeRow | undefined;
    if (row.email) emp = empByEmail.get(row.email);
    if (!emp) {
      for (const phone of row.phones) {
        emp = empByPhone.get(lastTenDigits(phone));
        if (emp) break;
      }
    }

    if (emp) {
      const firstRow = claimed.get(emp.id);
      if (firstRow) {
        ambiguous.push({ row, emp, firstRow });
        continue;
      }
      claimed.set(emp.id, row);

      let plan = computeEmployeeUpdate(emp, row);
      if (plan) warnings.push(...plan.warnings.map((w) => `${empLabel(emp!)} — ${w}`));
      // ACTIF présent au fichier : métier ajouté s'il ne l'a pas (la
      // réactivation, elle, repart de ce métier seul — voir plus bas).
      const added = emp.status === 'ACTIF' ? divisionsWithAdded(emp.divisions, DIV) : null;
      if (added) {
        plan = plan ?? { data: {}, changes: [], warnings: [], addressChanged: false };
        plan.data.divisions = added;
        plan.changes.push(`métier : + ${DIV_LABEL} (${emp.divisions.map((d) => DIVISION_LABEL[d]).join(' + ')} → ${added.map((d) => DIVISION_LABEL[d]).join(' + ')})`);
      }

      if (emp.status === 'INACTIF') {
        reactivations.push({ emp, row, plan });
      } else if (plan && Object.keys(plan.data).length > 0) {
        updates.push({ emp, row, plan });
      } else {
        unchanged.push({ emp, row });
      }
      continue;
    }

    // Aucun employé → création (enrichie du candidat/prospect correspondant).
    if (!row.email && row.phones.length === 0) {
      manualReview.push({ row, hints: empByName.get(normFull(row.firstName, row.lastName)) ?? [] });
      continue;
    }
    let cand: CandidateRow | null = (row.email && candByEmail.get(row.email)) || null;
    if (!cand) {
      for (const phone of row.phones) {
        cand = candByPhone.get(lastTenDigits(phone)) ?? null;
        if (cand) break;
      }
    }
    let prosp: ProspectRow | null = (row.email && prospByEmail.get(row.email)) || null;
    if (!prosp) {
      for (const phone of row.phones) {
        prosp = prospByPhone.get(lastTenDigits(phone)) ?? null;
        if (prosp) break;
      }
    }
    creations.push({ row, cand, prosp });
  }

  // Absents du fichier : seulement les ACTIF de CE métier. S'ils ont aussi
  // l'autre métier, on retire seulement celui-ci ; sinon départ probable.
  const toDeactivate: EmployeeRow[] = [];
  const toRemoveDivision: { emp: EmployeeRow; remaining: EmployeeDivision[] }[] = [];
  for (const e of employees) {
    if (e.status !== 'ACTIF' || claimed.has(e.id)) continue;
    const missing = planMissingEmployee(e.divisions, DIV);
    if (missing.action === 'deactivate') toDeactivate.push(e);
    else if (missing.action === 'removeDivision') toRemoveDivision.push({ emp: e, remaining: missing.remaining });
  }
  toDeactivate.sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr'));
  toRemoveDivision.sort((a, b) => a.emp.lastName.localeCompare(b.emp.lastName, 'fr'));

  // ── Rapport ──────────────────────────────────────────────────────────────
  const sortRows = <T extends { row: AgendrixRow }>(list: T[]) =>
    [...list].sort((a, b) => a.row.lastName.localeCompare(b.row.lastName, 'fr'));

  console.log(`\n─── CRÉATIONS (${creations.length}) ───`);
  for (const c of sortRows(creations)) {
    const origin = c.cand ? 'ex-Candidat' : c.prosp ? 'ex-Prospect' : 'nouveau';
    console.log(`  + ${label(c.row)} [${origin}]${c.row.tags.length ? ` tags: ${c.row.tags.join(',')}` : ''}`);
  }

  console.log(`\n─── MISES À JOUR (${updates.length}) ───`);
  for (const u of sortRows(updates)) {
    console.log(`  ~ ${empLabel(u.emp)}`);
    for (const ch of u.plan.changes) console.log(`      ${ch}`);
  }

  console.log(`\n─── INCHANGÉS : ${unchanged.length} ───`);

  console.log(`\n─── RÉACTIVATIONS suggérées (${reactivations.length}) ${REACTIVATE ? '[--reactivate: APPLIQUÉES]' : '[rapport seulement — utiliser --reactivate]'} ───`);
  for (const r of sortRows(reactivations)) {
    console.log(`  ↑ ${empLabel(r.emp)} — réactivé comme ${DIV_LABEL} seulement`);
  }

  console.log(`\n─── DÉPARTS probables (${toDeactivate.length}) ${DEACTIVATE_MISSING ? '[--deactivate-missing: DÉSACTIVÉS]' : '[rapport seulement — utiliser --deactivate-missing]'} ───`);
  for (const e of toDeactivate) {
    console.log(`  ↓ ${empLabel(e)}${e.city ? ` — ${e.city}` : ''}${e.phone ? ` — ${e.phone}` : ''}`);
  }

  console.log(`\n─── MÉTIER « ${DIV_LABEL} » RETIRÉ, restent ACTIFS (${toRemoveDivision.length}) ${DEACTIVATE_MISSING ? '[--deactivate-missing: APPLIQUÉ]' : '[rapport seulement — utiliser --deactivate-missing]'} ───`);
  for (const r of toRemoveDivision) {
    console.log(`  − ${empLabel(r.emp)} — reste ${r.remaining.map((d) => DIVISION_LABEL[d]).join(' + ')}`);
  }

  if (ambiguous.length > 0) {
    console.log(`\n─── AMBIGUS (${ambiguous.length}) — aucune écriture ───`);
    for (const a of ambiguous) {
      console.log(`  ? ${label(a.row)} → employé ${empLabel(a.emp)} déjà réclamé par ${label(a.firstRow)}`);
    }
  }

  if (manualReview.length > 0) {
    console.log(`\n─── REVUE MANUELLE (${manualReview.length}) — ni courriel ni téléphone ───`);
    for (const m of manualReview) {
      const hint = m.hints.length
        ? ` (indice nom identique: ${m.hints.map((h) => empLabel(h)).join(' / ')})`
        : '';
      console.log(`  ! ${label(m.row)}${hint}`);
    }
  }

  if (warnings.length > 0) {
    console.log(`\n─── AVERTISSEMENTS (${warnings.length}) ───`);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }

  // ── Application ──────────────────────────────────────────────────────────
  let errors = 0;
  const geocodeIds = new Set<string>();

  if (APPLY) {
    console.log('\n─── APPLICATION ───');

    for (const c of creations) {
      try {
        const { row, cand, prosp } = c;
        const created = await prisma.$transaction(async (tx) => {
          const employee = await tx.employee.create({
            data: {
              firstName: row.firstName,
              lastName: row.lastName,
              email: row.email,
              phone: row.primaryPhone || cand?.phone || prosp?.phone || '',
              address: row.parsed.address ?? cand?.address ?? prosp?.streetAddress ?? null,
              city: row.parsed.city ?? cand?.city ?? prosp?.city ?? null,
              province: row.rawAddress
                ? row.parsed.province
                : cand?.province || prosp?.province || 'QC',
              postalCode: row.parsed.postalCode ?? cand?.postalCode ?? prosp?.postalCode ?? null,
              status: 'ACTIF',
              employeeNumber: row.matricule,
              hasBSP: cand?.hasBSP ?? false,
              bspNumber: cand?.bspNumber ?? null,
              bspExpiryDate: cand?.bspExpiryDate ?? null,
              hasVehicle: cand?.hasVehicle ?? false,
              cvUrl: cand?.cvUrl ?? prosp?.cvUrl ?? null,
              cvStoragePath: cand?.cvStoragePath ?? prosp?.cvStoragePath ?? null,
              videoUrl: cand?.videoUrl ?? prosp?.videoUrl ?? null,
              videoStoragePath: cand?.videoStoragePath ?? prosp?.videoStoragePath ?? null,
              notes: cand?.hrNotes ?? prosp?.notes ?? null,
              convertedFromCandidateId: cand?.id ?? null,
              divisions: [DIV],
            },
          });
          // Un contact ne vit qu'à une place : le candidat sort de Candidats,
          // le prospect est masqué (converti) — mêmes effets que les promotions.
          if (cand) {
            await tx.candidate.update({
              where: { id: cand.id },
              data: { isDeleted: true, deletedAt: new Date() },
            });
          }
          if (prosp) {
            await tx.prospectCandidate.update({
              where: { id: prosp.id },
              data: { isConverted: true, convertedAt: new Date(), convertedToId: employee.id },
            });
          }
          return employee;
        });
        await recordEmployeeAudit({
          employeeId: created.id,
          userId: actorId,
          action: 'CREATE',
          details: `Employé créé comme ${DIV_LABEL} par l'import Agendrix (présent dans ${fileName})`,
        });
        geocodeIds.add(created.id);
      } catch (e: any) {
        errors++;
        console.error(`  ✗ création ${label(c.row)}: ${e.message}`);
      }
    }
    console.log(`  Créations appliquées : ${creations.length - errors}`);

    for (const u of updates) {
      try {
        await prisma.employee.update({ where: { id: u.emp.id }, data: u.plan.data });
        if (u.plan.data.divisions) {
          await recordEmployeeAudit({
            employeeId: u.emp.id,
            userId: actorId,
            details: `Métier ${DIV_LABEL} ajouté par l'import Agendrix (présent dans ${fileName})`,
          });
        }
        if (u.plan.addressChanged || u.emp.lat == null) geocodeIds.add(u.emp.id);
      } catch (e: any) {
        errors++;
        console.error(`  ✗ mise à jour ${empLabel(u.emp)}: ${e.message}`);
      }
    }
    console.log(`  Mises à jour appliquées : ${updates.length}`);

    if (REACTIVATE) {
      for (const r of reactivations) {
        try {
          await prisma.employee.update({
            where: { id: r.emp.id },
            data: {
              ...(r.plan?.data ?? {}),
              divisions: [DIV],
              status: 'ACTIF',
              terminationDate: null,
              uniformReturnDeadlineAt: null,
            },
          });
          if (r.emp.uniformReturnDeadlineAt) {
            await revertUniformOffboarding(r.emp.id, r.emp.uniformReturnDeadlineAt);
          }
          await recordEmployeeAudit({
            employeeId: r.emp.id,
            userId: actorId,
            details: `Employé réactivé comme ${DIV_LABEL} par l'import Agendrix (présent dans ${fileName})`,
          });
          geocodeIds.add(r.emp.id);
        } catch (e: any) {
          errors++;
          console.error(`  ✗ réactivation ${empLabel(r.emp)}: ${e.message}`);
        }
      }
      console.log(`  Réactivations appliquées : ${reactivations.length}`);
    }

    if (DEACTIVATE_MISSING) {
      for (const e of toDeactivate) {
        try {
          const fields = buildDeactivationFields(e);
          await prisma.employee.update({
            where: { id: e.id },
            data: { status: 'INACTIF', ...fields },
          });
          const warning = await propagateUniformOffboarding(e.id, fields.uniformReturnDeadlineAt);
          await recordEmployeeAudit({
            employeeId: e.id,
            userId: actorId,
            details: `Employé passé à Inactif par l'import Agendrix (absent de ${fileName})`,
          });
          if (warning) {
            console.log(
              `  ⚠ ${empLabel(e)} détient ${warning.totalPieces} pièce(s) d'uniforme (${warning.owed.toFixed(2)} $ dus) — échéance ${fields.uniformReturnDeadlineAt.toISOString().slice(0, 10)}`
            );
          }
        } catch (err: any) {
          errors++;
          console.error(`  ✗ désactivation ${empLabel(e)}: ${err.message}`);
        }
      }
      console.log(`  Désactivations appliquées : ${toDeactivate.length}`);

      for (const r of toRemoveDivision) {
        try {
          await prisma.employee.update({ where: { id: r.emp.id }, data: { divisions: r.remaining } });
          await recordEmployeeAudit({
            employeeId: r.emp.id,
            userId: actorId,
            details: `Métier ${DIV_LABEL} retiré par l'import Agendrix (absent de ${fileName}) — reste ${r.remaining.map((d) => DIVISION_LABEL[d]).join(' + ')}`,
          });
        } catch (err: any) {
          errors++;
          console.error(`  ✗ retrait du métier ${empLabel(r.emp)}: ${err.message}`);
        }
      }
      console.log(`  Métiers retirés (restent actifs) : ${toRemoveDivision.length}`);
    }

    await invalidateCaches({ statKeys: [EMPLOYEE_MAPPOINTS_CACHE_KEY] });

    // ── Géocodage (adresse exacte → FSA → ville) ───────────────────────────
    if (!SKIP_GEOCODE) {
      const missing = await prisma.employee.findMany({
        where: { isDeleted: false, status: 'ACTIF', lat: null },
        select: { id: true },
      });
      for (const m of missing) geocodeIds.add(m.id);

      console.log(`\n─── GÉOCODAGE (${geocodeIds.size} employés, ~1,1 s/adresse) ───`);
      const tally = { address: 0, postal: 0, city: 0, unresolved: 0 };
      let done = 0;
      for (const id of geocodeIds) {
        const geo = await geocodeEmployeeById(id);
        if (geo) tally[geo.source]++;
        else tally.unresolved++;
        done++;
        if (done % 25 === 0) console.log(`  … ${done}/${geocodeIds.size}`);
      }
      console.log(
        `  Placés : ${tally.address + tally.postal + tally.city} (adresse ${tally.address}, code postal ${tally.postal}, ville ${tally.city}) — non résolus : ${tally.unresolved}`
      );
      if (tally.unresolved > 0) {
        console.log('  Astuce : relancer `npm run backfill:geocode-employees` plus tard (villes géocodées en arrière-plan).');
      }
    }
  }

  // ── Résumé ───────────────────────────────────────────────────────────────
  console.log(`\n=== RÉSUMÉ ${APPLY ? '(APPLIQUÉ)' : '(DRY-RUN)'} ===`);
  console.log(`Lignes fichier valides : ${rows.length}`);
  console.log(`  Créations       : ${creations.length}`);
  console.log(`  Mises à jour    : ${updates.length}`);
  console.log(`  Inchangés       : ${unchanged.length}`);
  console.log(`  Réactivations   : ${reactivations.length} ${REACTIVATE ? '(appliquées)' : '(suggestion)'}`);
  console.log(`  Départs (${DIV === 'SECURITE' ? 'agents' : 'signaleurs'} ACTIFS absents du fichier) : ${toDeactivate.length} ${DEACTIVATE_MISSING ? '(désactivés)' : '(suggestion)'}`);
  console.log(`  Métier retiré, restent actifs : ${toRemoveDivision.length} ${DEACTIVATE_MISSING ? '(appliqué)' : '(suggestion)'}`);
  console.log(`  Ambigus         : ${ambiguous.length} — Revue manuelle : ${manualReview.length}`);
  if (errors > 0) console.log(`  ERREURS         : ${errors}`);
  if (!APPLY) {
    console.log('\n(Aucune écriture faite. Relancer avec --apply — et --deactivate-missing / --reactivate au besoin.)');
  }
}

main()
  .catch((e) => {
    console.error('[import-agendrix] échec :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
