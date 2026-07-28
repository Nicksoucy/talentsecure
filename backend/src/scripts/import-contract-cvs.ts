/**
 * Import d'un lot de CV rattaché à un CONTRAT client (ex. « PSB »).
 *
 * Pour chaque CV du dossier : lit le texte, en extrait nom/courriel/téléphone/
 * adresse, cherche la personne dans les trois sections (employé/candidat/
 * prospect), puis :
 *   - personne trouvée   → TAGUE sa fiche existante (aucun doublon, aucune
 *                          écriture dans sa fiche) ;
 *   - personne inconnue  → crée un ProspectCandidate (source « <code>-cv ») ;
 *   - ambiguë (nom seul) → RAPPORTE, sans rien écrire.
 * Puis dépose le CV dans le stockage et géocode à l'adresse de la rue.
 *
 * DRY-RUN PAR DÉFAUT — rien n'est écrit sans --apply.
 *
 *   npm run import:contract-cvs -- --dir "/chemin/CV" --code PSB
 *   npm run import:contract-cvs -- --dir "/chemin/CV" --code PSB --apply
 *
 * Options :
 *   --apply           écrit réellement (sinon simple rapport)
 *   --skip-geocode    n'appelle pas Nominatim (~1,1 s/adresse)
 *   --skip-upload     ne dépose pas les fichiers CV dans le stockage
 *   --require-exact   ne crée que les personnes placées À LA RUE
 *   --name-match=X    skip (défaut) | tag | create — politique pour les
 *                     correspondances par NOM SEUL, à ne changer qu'après
 *                     lecture du rapport
 *   --recursive       parcourt aussi les sous-dossiers
 */
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../config/database';
import { findContactEverywhere } from '../utils/candidateMatch';
import { lastTenDigits } from '../utils/phone';
import { canonicalCity } from '../utils/cityNormalize';
import { cvExtractionService } from '../services/cv-extraction.service';
import { uploadBufferToR2, useR2 } from '../services/r2.service';
import {
  invalidateContractCaches,
  normalizeContractCode,
  tagPerson,
} from '../services/contractLeads.service';
import { geocodeContractPeople } from '../services/contractGeocode.service';
import {
  ExistingMatch,
  NameMatchPolicy,
  ParsedCv,
  batchKey,
  isUnreadableCv,
  normalizeNameKey,
  parseCvContact,
} from '../utils/contractCvImport';
import { ContactSection } from '../utils/candidateMatch';

// ───────────────────────────────────────────────────────── Arguments ──

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const value = (name: string): string | undefined => {
  const withEq = argv.find((a) => a.startsWith(`--${name}=`));
  if (withEq) return withEq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
};

const DIR = value('dir');
const CODE_RAW = value('code');
const APPLY = flag('apply');
const SKIP_GEOCODE = flag('skip-geocode');
const SKIP_UPLOAD = flag('skip-upload');
const REQUIRE_EXACT = flag('require-exact');
const RECURSIVE = flag('recursive');
const NAME_MATCH = (value('name-match') || 'skip') as NameMatchPolicy;

if (!DIR || !CODE_RAW) {
  console.error(
    'Usage : npm run import:contract-cvs -- --dir "<dossier de CV>" --code <CONTRAT> [--apply]\n' +
      '        [--skip-geocode] [--skip-upload] [--require-exact] [--name-match=skip|tag|create] [--recursive]'
  );
  process.exit(1);
}
if (!['skip', 'tag', 'create'].includes(NAME_MATCH)) {
  console.error(`--name-match invalide : « ${NAME_MATCH} » (attendu skip | tag | create)`);
  process.exit(1);
}

const CODE = normalizeContractCode(CODE_RAW);
const SOURCE = `${CODE.toLowerCase()}-cv`;

/** Hôte de la base, identifiants masqués — l'opérateur doit VOIR où il écrit. */
function maskedDbHost(): string {
  const raw = process.env.DATABASE_URL || '(DATABASE_URL absent)';
  return raw.replace(/\/\/[^@]*@/, '//***@').replace(/([?&])(password|sslmode)=[^&]*/gi, '$1$2=***');
}

// ───────────────────────────────────────────────────── Lecture des CV ──

const CV_EXT = new Set(['.pdf', '.docx']);

function listCvFiles(dir: string, recursive: boolean): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) out.push(...listCvFiles(full, true));
      continue;
    }
    // Fichiers temporaires Word et métadonnées macOS.
    if (entry.name.startsWith('~$') || entry.name.startsWith('.')) continue;
    if (!CV_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    if (fs.statSync(full).size === 0) continue;
    out.push(full);
  }
  return out.sort();
}

async function readCvText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return cvExtractionService.extractTextFromPDF(filePath);
  if (ext === '.docx') return cvExtractionService.extractTextFromDocx(filePath);
  return '';
}

// ────────────────────────────────────────── Correspondance par nom seul ──

/**
 * Cherche une personne portant EXACTEMENT ce nom (sans email/téléphone commun).
 * Sert uniquement à SIGNALER une ambiguïté : deux homonymes ne sont pas la même
 * personne, donc on ne tague/crée jamais sur cette seule base sans --name-match.
 */
async function findNameOnlyMatch(p: ParsedCv): Promise<ExistingMatch | null> {
  const key = normalizeNameKey(`${p.firstName}${p.lastName}`);
  const where = {
    isDeleted: false,
    firstName: { equals: p.firstName, mode: 'insensitive' as const },
    lastName: { equals: p.lastName, mode: 'insensitive' as const },
  };
  const select = { id: true, firstName: true, lastName: true };

  const emp = await prisma.employee.findFirst({ where, select });
  if (emp && normalizeNameKey(`${emp.firstName}${emp.lastName}`) === key) {
    return { section: 'employee', ...emp };
  }
  const cand = await prisma.candidate.findFirst({ where, select });
  if (cand && normalizeNameKey(`${cand.firstName}${cand.lastName}`) === key) {
    return { section: 'candidate', ...cand };
  }
  const prosp = await prisma.prospectCandidate.findFirst({ where, select });
  if (prosp && normalizeNameKey(`${prosp.firstName}${prosp.lastName}`) === key) {
    return { section: 'prospect', ...prosp };
  }
  return null;
}

// ──────────────────────────────────────────────────────── Dépôt du CV ──

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function safeFileSlug(s: string): string {
  return normalizeNameKey(s).slice(0, 40) || 'cv';
}

/** Dépose le CV et renvoie le chemin de stockage à écrire sur la fiche. */
async function storeCv(filePath: string, personId: string, parsed: ParsedCv): Promise<string | null> {
  const ext = path.extname(filePath).toLowerCase();
  const key = `cvs/contracts/${CODE}/${safeFileSlug(`${parsed.firstName}${parsed.lastName}`)}_${personId.slice(0, 8)}${ext}`;
  const buffer = fs.readFileSync(filePath);

  if (useR2) {
    const res = await uploadBufferToR2(buffer, key, MIME[ext] || 'application/octet-stream');
    return res.key;
  }
  // Repli local : même dossier que les CV téléversés par l'application.
  const localDir = path.join(__dirname, '../../uploads/cvs');
  fs.mkdirSync(localDir, { recursive: true });
  const fileName = `${path.basename(key)}`;
  fs.writeFileSync(path.join(localDir, fileName), buffer);
  return `uploads/cvs/${fileName}`;
}

// ─────────────────────────────────────────────────────────── Rapport ──

interface Buckets {
  creations: ParsedCv[];
  tagged: { p: ParsedCv; match: ExistingMatch }[];
  ambiguous: { p: ParsedCv; reason: string; personName?: string }[];
  batchDupes: { file: string; firstFile: string }[];
  unreadable: string[];
  noName: string[];
  suspectAddress: ParsedCv[];
  nameUnconfirmed: ParsedCv[];
  imprecise: ParsedCv[];
  skippedNotExact: ParsedCv[];
}

const section = (title: string, n: number) =>
  console.log(`\n─── ${title} (${n}) ${'─'.repeat(Math.max(0, 46 - title.length))}`);

function printReport(b: Buckets, total: number) {
  console.log(`\n=== IMPORT CV — CONTRAT ${CODE}${APPLY ? '' : ' (DRY-RUN — aucune écriture)'} ===`);
  console.log(`Base    : ${maskedDbHost()}`);
  console.log(`Dossier : ${DIR}`);
  console.log(`Fichiers lus : ${total}`);

  section('CRÉATIONS', b.creations.length);
  for (const p of b.creations) {
    console.log(`  + ${p.firstName} ${p.lastName} — ${p.city || 'ville ?'} · ${p.precision} (${p.fileName})`);
  }

  section('DÉJÀ EXISTANTS → TAGUÉS', b.tagged.length);
  for (const { p, match } of b.tagged) {
    console.log(`  ~ ${match.firstName} ${match.lastName} [${match.section}] (${p.fileName})`);
  }

  section('AMBIGUS — AUCUNE ÉCRITURE', b.ambiguous.length);
  for (const a of b.ambiguous) {
    console.log(`  ? ${a.p.firstName} ${a.p.lastName} — ${a.reason} (${a.p.fileName})`);
  }

  section('DOUBLONS DANS LE DOSSIER', b.batchDupes.length);
  for (const d of b.batchDupes) console.log(`  = ${d.file} ↔ ${d.firstFile}`);

  section('NOM À VÉRIFIER (fichier ≠ CV)', b.nameUnconfirmed.length);
  for (const p of b.nameUnconfirmed) console.log(`  ! ${p.firstName} ${p.lastName} ← ${p.fileName}`);

  section('ADRESSE DOUTEUSE (employeur ?)', b.suspectAddress.length);
  for (const p of b.suspectAddress) {
    console.log(`  ! ${p.firstName} ${p.lastName} — « ${p.suspectStreetOutsideHeader} » (${p.fileName})`);
  }

  section('POSITION APPROXIMATIVE OU ABSENTE', b.imprecise.length);
  for (const p of b.imprecise) {
    const label =
      p.precision === 'postal' ? 'secteur postal' : p.precision === 'city' ? 'centre-ville' : 'AUCUN PIN';
    console.log(`  · ${p.firstName} ${p.lastName} — ${label} (${p.fileName})`);
  }

  if (REQUIRE_EXACT) {
    section('ÉCARTÉS PAR --require-exact', b.skippedNotExact.length);
    for (const p of b.skippedNotExact) console.log(`  – ${p.firstName} ${p.lastName} (${p.fileName})`);
  }

  section('CV ILLISIBLES (PDF image ?)', b.unreadable.length);
  for (const f of b.unreadable) console.log(`  ! ${f}`);

  section('NOM INTROUVABLE DANS LE CV', b.noName.length);
  for (const f of b.noName) console.log(`  ! ${f}`);
}

// ────────────────────────────────────────────────────────────── Main ──

async function main() {
  if (!fs.existsSync(DIR!)) {
    console.error(`Dossier introuvable : ${DIR}`);
    process.exit(1);
  }

  const files = listCvFiles(DIR!, RECURSIVE);
  const b: Buckets = {
    creations: [], tagged: [], ambiguous: [], batchDupes: [], unreadable: [],
    noName: [], suspectAddress: [], nameUnconfirmed: [], imprecise: [], skippedNotExact: [],
  };

  // Décisions à appliquer, calculées AVANT toute écriture.
  const toCreate: ParsedCv[] = [];
  const toTag: { p: ParsedCv; match: ExistingMatch }[] = [];
  const seen = new Map<string, string>();

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const text = await readCvText(filePath);

    if (isUnreadableCv(text)) {
      b.unreadable.push(fileName);
      continue;
    }

    const parsed = parseCvContact(text, fileName);
    if (!parsed) {
      b.noName.push(fileName);
      continue;
    }
    (parsed as ParsedCv & { _path: string })._path = filePath;

    if (!parsed.nameConfirmed) b.nameUnconfirmed.push(parsed);
    if (parsed.suspectStreetOutsideHeader) b.suspectAddress.push(parsed);
    if (parsed.precision !== 'street') b.imprecise.push(parsed);

    // Doublon à l'intérieur du lot (deux CV de la même personne).
    const key = batchKey(parsed);
    const first = seen.get(key);
    if (first) {
      b.batchDupes.push({ file: fileName, firstFile: first });
      continue;
    }
    seen.set(key, fileName);

    const contactMatch = await findContactEverywhere(prisma, parsed.email, parsed.phone);
    const existing: ExistingMatch | null = contactMatch
      ? { section: contactMatch.section, id: contactMatch.id, firstName: contactMatch.firstName, lastName: contactMatch.lastName }
      : null;

    if (existing) {
      b.tagged.push({ p: parsed, match: existing });
      toTag.push({ p: parsed, match: existing });
      continue;
    }

    const nameOnly = await findNameOnlyMatch(parsed);
    if (nameOnly && NAME_MATCH === 'skip') {
      b.ambiguous.push({
        p: parsed,
        reason: `même nom qu'un ${nameOnly.section} existant, sans courriel ni téléphone commun`,
      });
      continue;
    }
    if (nameOnly && NAME_MATCH === 'tag') {
      b.tagged.push({ p: parsed, match: nameOnly });
      toTag.push({ p: parsed, match: nameOnly });
      continue;
    }
    if (!parsed.email && !parsed.phone && NAME_MATCH === 'skip') {
      b.ambiguous.push({ p: parsed, reason: 'ni courriel ni téléphone — dédoublonnage impossible' });
      continue;
    }
    if (REQUIRE_EXACT && parsed.precision !== 'street') {
      b.skippedNotExact.push(parsed);
      continue;
    }

    b.creations.push(parsed);
    toCreate.push(parsed);
  }

  printReport(b, files.length);

  if (!APPLY) {
    console.log(`\n=== RÉSUMÉ (DRY-RUN) ===`);
    console.log(`  à créer : ${toCreate.length} · à taguer : ${toTag.length} · ambigus : ${b.ambiguous.length}`);
    console.log('  Aucune écriture faite. Relancer avec --apply.');
    return;
  }

  // ── Écritures ────────────────────────────────────────────────────────
  console.log('\n=== ÉCRITURE ===');
  const geocodeTargets: { section: ContactSection; id: string }[] = [];

  for (const p of toCreate) {
    const created = await prisma.prospectCandidate.create({
      data: {
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        phone: p.phone || '', // colonne NOT NULL — même convention que survey-sync
        streetAddress: p.address,
        fullAddress: p.address,
        city: p.city ? canonicalCity(p.city) : null,
        province: p.province,
        postalCode: p.postalCode,
        source: SOURCE,
        submissionDate: new Date(),
        notes: `Importé du lot CV « ${CODE} » (fichier ${p.fileName}).`,
      },
      select: { id: true },
    });

    if (!SKIP_UPLOAD) {
      try {
        const storagePath = await storeCv((p as any)._path, created.id, p);
        if (storagePath) {
          await prisma.prospectCandidate.update({
            where: { id: created.id },
            data: { cvStoragePath: storagePath },
          });
        }
      } catch (e: any) {
        console.warn(`  ⚠️ dépôt du CV échoué pour ${p.fileName}: ${e?.message}`);
      }
    }

    await tagPerson({
      contractCode: CODE,
      personType: 'prospect',
      personId: created.id,
      sourceCvFile: p.fileName,
      email: p.email,
      phone: p.phone,
    });
  }
  console.log(`  ${toCreate.length} personne(s) créée(s).`);

  for (const { p, match } of toTag) {
    // On TAGUE seulement : la fiche existante n'est jamais modifiée.
    await tagPerson({
      contractCode: CODE,
      personType: match.section as ContactSection,
      personId: match.id,
      sourceCvFile: p.fileName,
      email: p.email,
      phone: p.phone,
    });
  }
  console.log(`  ${toTag.length} personne(s) existante(s) taguée(s) (fiches inchangées).`);

  // Best-effort : sans Redis joignable (CACHE_ENABLED=true et serveur absent),
  // une invalidation bloquante suspendrait l'import juste avant le géocodage.
  // Un cache périmé se résorbe seul en 5 min ; un import figé, non.
  await invalidateContractCaches().catch(() => {
    console.warn('  ⚠️ invalidation du cache impossible (Redis injoignable) — TTL de 5 min prendra le relais.');
  });

  // ── Géocodage (rejouable) ────────────────────────────────────────────
  // On repart de l'état RÉEL de la base (toute personne taguée sans
  // coordonnées), pas de la liste des créations de ce run : un import
  // interrompu se rattrape ainsi avec `npm run backfill:geocode-contract`.
  if (SKIP_GEOCODE) {
    console.log('\nGéocodage ignoré (--skip-geocode).');
    console.log(`À rattraper avec : npm run backfill:geocode-contract -- --code ${CODE}`);
  } else {
    const pending = await findContractPeopleNeedingGeocode(CODE);
    if (pending.length === 0) {
      console.log('\nGéocodage : rien à faire.');
    } else {
      console.log(`\n=== GÉOCODAGE (${pending.length} adresse(s), ~1,1 s chacune) ===`);
      const tally = await geocodeContractPeople(pending, (done, total) =>
        console.log(`  … ${done}/${total}`)
      );
      console.log(
        `  rue : ${tally.address} · secteur : ${tally.postal} · ville : ${tally.city} · non résolus : ${tally.unresolved}`
      );
    }
  }

  console.log('\n=== TERMINÉ ===');
}

main()
  .catch((e) => {
    console.error('Import interrompu :', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
