/**
 * Helpers PURS (sans Prisma/IO) de l'import Agendrix — parsing des lignes de
 * l'export « Agendrix - employés » (Prénom, Nom, Adresse municipale, Courriel,
 * 3× Téléphone + type) et politique de fusion vers la fiche Employé.
 *
 * Testés unitairement (src/__tests__/agendrix-import.test.ts) ; le script
 * scripts/import-agendrix-employees.ts n'ajoute que l'IO (xlsx, DB, rapport).
 */
import { lastTenDigits } from './phone';
import { canonicalCity, normalizeCityKey, resolveCanonical, resolveProvince } from './cityNormalize';

// ───────────────────────────────────────────────────────────────────────────
// Adresse municipale (chaîne libre) → rue / ville / province / code postal
// ───────────────────────────────────────────────────────────────────────────

export interface ParsedAddress {
  address: string | null;
  city: string | null;
  province: string;
  postalCode: string | null;
}

const POSTAL_RE = /([A-Za-z]\d[A-Za-z])\s*(\d[A-Za-z]\d)/;

// Tokens de province/territoire à ne JAMAIS retenir comme ville. Clé = lettres
// minuscules sans accents ni ponctuation (« Qué » → « que », « Q.C. » → « qc »).
// Valeur = code province 2 lettres (pour renseigner province quand il n'y a pas
// de code postal). « quebec » y figure comme avant : la ville « Québec » n'est
// pas perdue pour autant — un city null n'écrase jamais la fiche (voir merge).
const PROVINCE_BY_TOKEN: Record<string, string> = {
  ab: 'AB', bc: 'BC', mb: 'MB', nb: 'NB', nl: 'NL', ns: 'NS', nt: 'NT',
  nu: 'NU', on: 'ON', pe: 'PE', qc: 'QC', pq: 'QC', que: 'QC', sk: 'SK', yt: 'YT',
  ontario: 'ON', quebec: 'QC', provincedequebec: 'QC',
};

// Tokens « pays » (jamais une ville non plus) : « Canada », « CA », « CAN ».
const COUNTRY_TOKENS = new Set(['canada', 'ca', 'can']);

/** Lettres minuscules sans accents ni ponctuation (« Saint-Jean » → « saintjean »). */
function letterKey(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
}

/** Code province (2 lettres) si le segment EST un token de province isolé, sinon null. */
function provinceCode(s: string): string | null {
  return PROVINCE_BY_TOKEN[letterKey(s)] ?? null;
}

/** Vrai si le segment est un token « pays » (Canada / CA / CAN). */
function isCountryWord(s: string): boolean {
  return COUNTRY_TOKENS.has(letterKey(s));
}

/**
 * Découpe une « Adresse municipale » Agendrix best-effort.
 * Gère : « 2675 Bd Pie-IX, Montréal, QC H1V 2E8 », « 4710 Boul Décarie,
 * Montréal QC H3X 2H5, Canada », « 5-1655,Rue Mullins, Montréal,QC »,
 * « 4050 Rue prieur Est Montréal Nord Québec » (sans virgules),
 * « 350 rue evangeline l'assomption » (minuscules), ville/CP absents, etc.
 * XGuard a des agents hors-Québec (région d'Ottawa) : un token de province
 * (« ON », « QUE », « Ontario »…) n'est JAMAIS gardé comme ville — il renseigne
 * la province, et la vraie ville (« Ottawa », « Gloucester ») est extraite quand
 * elle précède le code. Province : code postal prioritaire, sinon token nommé,
 * sinon QC.
 */
export function parseAgendrixAddress(raw?: string | null): ParsedAddress {
  let s = (raw || '').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

  // Province explicitement nommée dans la chaîne (« , ON », « Montréal QC ») —
  // captée pour renseigner la province, jamais gardée comme ville.
  let mentionedProvince: string | null = null;

  // 1) Code postal (retiré de la chaîne, normalisé « H1V 2E8 »).
  let postalCode: string | null = null;
  const pm = s.match(POSTAL_RE);
  if (pm) {
    postalCode = `${pm[1]} ${pm[2]}`.toUpperCase();
    s = (s.slice(0, pm.index) + s.slice((pm.index ?? 0) + pm[0].length)).trim();
  }

  const finish = (address: string | null, city: string | null): ParsedAddress => {
    const cityClean = city ? canonicalCity(city) : '';
    return {
      address,
      city: cityClean || null,
      province: resolveProvince({ postalCode, province: mentionedProvince }),
      postalCode,
    };
  };

  if (!s) return finish(null, null);

  // 2) Segments par virgules, sans pays (« Canada »/« CA ») ni token de province
  //    isolé (« QC », « ON », « QUE »… → capté dans mentionedProvince).
  const segments = s
    .split(',')
    .map((p) => p.trim().replace(/[\s,]+$/g, ''))
    .filter(Boolean)
    .filter((p) => !isCountryWord(p))
    .filter((p) => {
      const code = provinceCode(p);
      if (code) {
        mentionedProvince = code;
        return false;
      }
      return true;
    });

  if (segments.length === 0) return finish(null, null);

  // Retire une province COLLÉE au dernier mot d'un segment (« Montréal QC »,
  // « Ottawa ON », « Gloucester Ontario ») — captée, jamais gardée comme ville.
  const stripGluedProvince = (seg: string): string => {
    const m = seg.match(/^(.*\S)\s+(\S+)$/);
    if (m) {
      const code = provinceCode(m[2]);
      if (code) {
        mentionedProvince = code;
        return m[1].trim();
      }
    }
    return seg;
  };

  let city: string | null = null;
  let addressParts: string[];

  if (segments.length >= 2) {
    // Dernier segment = ville (« Appartement 822 » reste dans la rue). On ne
    // retire un « QC »/« ON » collé QUE sur ce segment-ville — jamais sur une rue
    // (« 1234 Rue Ontario » garde « Ontario »).
    const last = stripGluedProvince(segments[segments.length - 1]);
    if (last && !/\d/.test(last)) {
      city = last;
      addressParts = segments.slice(0, -1);
    } else {
      addressParts = segments;
    }
  } else {
    // Un seul segment (aucune virgule) : on écarte les tokens de province en fin
    // (« … Ottawa ON », « … Montréal Nord Québec ») pour délimiter la ville, mais
    // on ne les retient comme province QUE si une vraie ville est reconnue juste
    // avant — sinon « 1234 Rue Ontario » resterait amputé de « Ontario ».
    const words = segments[0].split(' ').filter(Boolean);
    const core = [...words];
    let trailingProvince: string | null = null;
    while (core.length > 1) {
      const code = provinceCode(core[core.length - 1]);
      if (!code) break;
      trailingProvince = code;
      core.pop();
    }
    // Suffixe le plus long d'abord ; jamais un segment contenant un chiffre.
    let matched: { city: string; take: number } | null = null;
    const maxTake = Math.min(4, core.length);
    for (let take = maxTake; take >= 1 && !matched; take--) {
      const tail = core.slice(core.length - take);
      if (tail.some((w) => /\d/.test(w))) continue;
      const resolved = resolveCanonical(tail.join(' '));
      if (resolved) matched = { city: resolved, take };
    }
    if (matched) {
      if (trailingProvince) mentionedProvince = trailingProvince;
      city = matched.city;
      addressParts = [core.slice(0, core.length - matched.take).join(' ')];
    } else {
      // Ville non reconnue → on GARDE les mots d'origine (province incluse).
      addressParts = [words.join(' ')];
    }
  }

  const address = addressParts.join(', ').trim() || null;
  return finish(address, city);
}

// ───────────────────────────────────────────────────────────────────────────
// Noms : tags « (EE) », « (PSB) », « (vaccinée) » et matricule préfixé
// ───────────────────────────────────────────────────────────────────────────

/** « Bah (EE) » → { name: 'Bah', tags: ['EE'] } ; tolère tags multiples/absents. */
export function cleanNameTags(raw?: string | null): { name: string; tags: string[] } {
  const tags: string[] = [];
  const name = (raw || '')
    .replace(/\(([^)]*)\)/g, (_, tag: string) => {
      const t = tag.trim();
      if (t) tags.push(t);
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { name, tags };
}

/** « 3221-Yvan » → { firstName: 'Yvan', matricule: '3221' } (défensif). */
export function parseMatriculePrefix(rawFirstName: string): {
  firstName: string;
  matricule: string | null;
} {
  const m = (rawFirstName || '').match(/^(\d{3,6})\s*-\s*(.+)$/);
  if (m) return { firstName: m[2].trim(), matricule: m[1] };
  return { firstName: (rawFirstName || '').trim(), matricule: null };
}

// ───────────────────────────────────────────────────────────────────────────
// Colonnes : l'export Agendrix laisse choisir et ordonner les colonnes
// ───────────────────────────────────────────────────────────────────────────

const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');

/** Index (0-based) des colonnes du fichier, retrouvées par leur entête. */
export interface AgendrixColumnMap {
  firstName: number;
  lastName: number;
  address: number | null;
  email: number | null;
  /** Paires (téléphone, type) dans l'ordre du fichier — type null si absent. */
  phones: { phone: number; type: number | null }[];
}

/**
 * Entêtes → index des colonnes. Les exports observés n'ont PAS le même ordre
 * (« Prénom | Nom | Adresse | Courriel | Tél… » le 17 juillet, « … | Courriel |
 * Tél… | Adresse » le 10 août, sans courriel ni adresse le 30 septembre) : lire
 * par position mélangerait courriels, téléphones et adresses.
 * Prénom et Nom sont obligatoires ; le reste est optionnel.
 */
export function buildAgendrixColumnMap(headers: string[]): AgendrixColumnMap {
  const keys = headers.map((h) => normName(String(h ?? '')));
  const find = (k: string) => {
    const i = keys.indexOf(k);
    return i >= 0 ? i : null;
  };
  const firstName = find('prenom');
  const lastName = find('nom');
  if (firstName == null || lastName == null) {
    throw new Error(
      `Entêtes « Prénom » et « Nom » introuvables (entêtes lues : ${headers.join(' | ')})`
    );
  }
  const phones: AgendrixColumnMap['phones'] = [];
  keys.forEach((k, i) => {
    if (k !== 'telephone') return;
    const next = keys[i + 1] === 'typedetelephone' ? i + 1 : null;
    phones.push({ phone: i, type: next });
  });
  return {
    firstName,
    lastName,
    address: find('adressemunicipale') ?? find('adresse'),
    email: find('courriel') ?? find('adressecourriel'),
    phones,
  };
}

/**
 * Cellules du fichier → 10 cellules dans l'ordre canonique attendu par
 * normalizeAgendrixRow (Prénom, Nom, Adresse, Courriel, 3× Téléphone + type).
 */
export function toCanonicalCells(map: AgendrixColumnMap, cells: string[]): string[] {
  const at = (i: number | null) => (i == null ? '' : String(cells[i] ?? ''));
  const out = [at(map.firstName), at(map.lastName), at(map.address), at(map.email)];
  for (let k = 0; k < 3; k++) {
    const p = map.phones[k];
    out.push(p ? at(p.phone) : '', p ? at(p.type) : '');
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Ligne Agendrix normalisée
// ───────────────────────────────────────────────────────────────────────────

export interface AgendrixRow {
  rowNumber: number;
  firstName: string;
  lastName: string;
  tags: string[];
  /** Courriel trim + minuscules, sinon null. */
  email: string | null;
  /** Téléphones non vides (type « Mobile » d'abord), dédupliqués (10 derniers chiffres). */
  phones: string[];
  primaryPhone: string | null;
  rawAddress: string | null;
  parsed: ParsedAddress;
  matricule: string | null;
}

// Boîtes partagées XGuard présentes comme « employés » dans Agendrix. Liste
// fermée : de vrais employés ont un courriel @xguard.ca (souvent sans
// téléphone), on ne peut donc pas écarter tout le domaine.
const DEPARTMENT_MAILBOXES = new Set([
  'rh',
  'comptabilite',
  'gestionprojets',
  'paie',
  'operations',
  'info',
  'admin',
  'recrutement',
]);
const DEPARTMENT_NAMES = new Set(['ressourceshumaines', 'comptabilite', 'operations']);

/**
 * Compte département : Prénom ou Nom == « xguard » (« Comptabilité Xguard »),
 * nom complet de service (« Ressources Humaines »), ou boîte partagée connue
 * (rh@xguard.ca, gestionprojets@xguard.ca…).
 */
export function isDepartmentAccount(
  firstName: string,
  lastName: string,
  email: string | null
): boolean {
  if (firstName.toLowerCase() === 'xguard' || lastName.toLowerCase() === 'xguard') return true;
  if (DEPARTMENT_NAMES.has(normName(`${firstName}${lastName}`))) return true;
  const m = (email || '').match(/^([^@]+)@xguard\.ca$/i);
  return !!m && DEPARTMENT_MAILBOXES.has(normName(m[1]));
}

/**
 * Cellules brutes d'une ligne (10 colonnes canoniques, chaînes — voir
 * toCanonicalCells) → ligne normalisée, ou { skipped } pour les lignes vides
 * et les comptes département (isDepartmentAccount).
 */
export function normalizeAgendrixRow(
  cells: (string | null | undefined)[],
  rowNumber: number
): AgendrixRow | { skipped: string } {
  const text = (i: number) => String(cells[i] ?? '').trim();

  const rawFirst = text(0);
  const rawLast = text(1);
  if (!rawFirst && !rawLast) return { skipped: 'ligne vide' };

  const firstTags = cleanNameTags(rawFirst);
  const lastTags = cleanNameTags(rawLast);
  const { firstName, matricule } = parseMatriculePrefix(firstTags.name);
  const lastName = lastTags.name;

  const email = text(3).toLowerCase() || null;

  if (isDepartmentAccount(firstName, lastName, email)) {
    return { skipped: `compte département (${rawFirst} ${rawLast})` };
  }

  // Téléphones : colonnes (4,6,8) + type (5,7,9) — « Mobile » d'abord.
  const entries: { phone: string; type: string }[] = [];
  for (const [pi, ti] of [
    [4, 5],
    [6, 7],
    [8, 9],
  ] as const) {
    const phone = text(pi);
    if (phone && lastTenDigits(phone).length >= 7) {
      entries.push({ phone, type: text(ti).toLowerCase() });
    }
  }
  entries.sort((a, b) => Number(b.type === 'mobile') - Number(a.type === 'mobile'));
  const seen = new Set<string>();
  const phones = entries
    .filter((e) => {
      const key = lastTenDigits(e.phone);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((e) => e.phone);

  const rawAddress = text(2) || null;

  return {
    rowNumber,
    firstName,
    lastName,
    tags: [...firstTags.tags, ...lastTags.tags],
    email,
    phones,
    primaryPhone: phones[0] ?? null,
    rawAddress,
    parsed: parseAgendrixAddress(rawAddress),
    matricule,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Politique de fusion Employé existant ← ligne Agendrix
// ───────────────────────────────────────────────────────────────────────────

export interface EmployeeSnapshot {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  address: string | null;
  city: string | null;
  province: string;
  postalCode: string | null;
  status: string;
  employeeNumber: string | null;
}

export interface UpdatePlan {
  /** Champs à écrire (prisma.employee.update). Vide si warnings seulement. */
  data: Record<string, unknown>;
  /** Diffs lisibles « champ: ancien → nouveau » (pour le rapport). */
  changes: string[];
  /** Anomalies à signaler sans écrire (nom divergent, matricule différent…). */
  warnings: string[];
  addressChanged: boolean;
}

const normPostal = (s?: string | null) => (s || '').replace(/\s+/g, '').toUpperCase();

/**
 * Fusion : Agendrix = source de vérité pour l'ADRESSE (quand la ligne en a une)
 * et complète courriel/téléphone/matricule ; ne touche jamais status, position,
 * assignment, hireDate, notes, BSP/CV, lat/lng (le géocodage suit à part).
 * Retourne null si rien à écrire ni à signaler.
 */
export function computeEmployeeUpdate(
  existing: EmployeeSnapshot,
  row: AgendrixRow
): UpdatePlan | null {
  const data: Record<string, unknown> = {};
  const changes: string[] = [];
  const warnings: string[] = [];
  const set = (field: keyof EmployeeSnapshot, value: unknown) => {
    data[field] = value;
    changes.push(`${field}: ${JSON.stringify(existing[field] ?? null)} → ${JSON.stringify(value)}`);
  };

  // Adresse — écrasée seulement si le fichier a une adresse.
  let addressChanged = false;
  if (row.rawAddress) {
    const p = row.parsed;
    if ((p.address || null) !== (existing.address || null)) {
      set('address', p.address);
      addressChanged = true;
    }
    if (p.city && normalizeCityKey(p.city) !== normalizeCityKey(existing.city)) {
      set('city', p.city);
      addressChanged = true;
    }
    if (p.postalCode && normPostal(p.postalCode) !== normPostal(existing.postalCode)) {
      set('postalCode', p.postalCode);
      addressChanged = true;
    }
    if (p.province !== (existing.province || 'QC')) {
      set('province', p.province);
      addressChanged = true;
    }
  }

  // Courriel : rempli si absent, mis à jour si différent (insensible à la casse).
  if (row.email && (existing.email || '').trim().toLowerCase() !== row.email) {
    set('email', row.email);
  }

  // Téléphone : rempli si absent ; remplacé si AUCUN des téléphones du fichier
  // ne correspond (10 derniers chiffres) ; sinon on garde le format DB.
  if (row.primaryPhone) {
    const dbTen = lastTenDigits(existing.phone);
    const fileTens = row.phones.map(lastTenDigits);
    if (!dbTen) {
      set('phone', row.primaryPhone);
    } else if (!fileTens.includes(dbTen)) {
      set('phone', row.primaryPhone);
    }
  }

  // Matricule : fill-only ; divergence signalée, jamais écrasée.
  if (row.matricule) {
    if (!existing.employeeNumber) {
      set('employeeNumber', row.matricule);
    } else if (existing.employeeNumber !== row.matricule) {
      warnings.push(
        `matricule Agendrix ${row.matricule} ≠ matricule DB ${existing.employeeNumber} (conservé)`
      );
    }
  }

  // Noms : on réécrit seulement pour retirer un tag encore présent en DB ;
  // divergence réelle (match par courriel/téléphone) → signalée, pas écrite.
  const dbFirstClean = cleanNameTags(existing.firstName).name;
  const dbLastClean = cleanNameTags(existing.lastName).name;
  if (dbFirstClean !== existing.firstName) set('firstName', dbFirstClean);
  if (dbLastClean !== existing.lastName) set('lastName', dbLastClean);
  if (
    normName(dbFirstClean) !== normName(row.firstName) ||
    normName(dbLastClean) !== normName(row.lastName)
  ) {
    warnings.push(
      `nom fichier « ${row.firstName} ${row.lastName} » ≠ nom DB « ${dbFirstClean} ${dbLastClean} » (conservé)`
    );
  }

  if (changes.length === 0 && warnings.length === 0) return null;
  return { data, changes, warnings, addressChanged };
}

// ───────────────────────────────────────────────────────────────────────────
// Métier (division) : chaque roster Agendrix ne gère QUE son métier
// ───────────────────────────────────────────────────────────────────────────

/** Même vocabulaire que les divisions d'uniformes (enum UniformDivision). */
export type EmployeeDivision = 'SECURITE' | 'SIGNALISATION';

export const DIVISION_LABEL: Record<EmployeeDivision, string> = {
  SECURITE: 'agent de sécurité',
  SIGNALISATION: 'signaleur',
};

/** « --division signalisation » → 'SIGNALISATION' ; défaut SECURITE ; null si inconnu. */
export function parseDivisionArg(raw?: string | null): EmployeeDivision | null {
  const k = normName(raw || 'securite');
  if (k === 'securite' || k === 'agent' || k === 'agents') return 'SECURITE';
  if (k === 'signalisation' || k === 'signaleur' || k === 'signaleurs') return 'SIGNALISATION';
  return null;
}

/**
 * Employé ACTIF présent au fichier du métier `division` : métiers à écrire
 * (métier ajouté, les autres conservés), ou null s'il l'a déjà.
 */
export function divisionsWithAdded(
  current: EmployeeDivision[],
  division: EmployeeDivision
): EmployeeDivision[] | null {
  if (current.includes(division)) return null;
  return sortDivisions([...current, division]);
}

export type MissingEmployeePlan =
  | { action: 'ignore' }
  | { action: 'removeDivision'; remaining: EmployeeDivision[] }
  | { action: 'deactivate' };

/**
 * Employé ACTIF ABSENT du fichier du métier `division` (--deactivate-missing) :
 * - pas de ce métier → rien (un signaleur n'est jamais touché par le fichier
 *   sécurité, et inversement) ;
 * - ce métier + un autre → on retire seulement ce métier, il reste ACTIF ;
 * - ce métier seulement → désactivation (fin d'emploi, uniformes).
 */
export function planMissingEmployee(
  current: EmployeeDivision[],
  division: EmployeeDivision
): MissingEmployeePlan {
  if (!current.includes(division)) return { action: 'ignore' };
  const remaining = current.filter((d) => d !== division);
  return remaining.length > 0 ? { action: 'removeDivision', remaining } : { action: 'deactivate' };
}

/** Ordre stable (sécurité d'abord) pour comparer et afficher. */
export function sortDivisions(list: EmployeeDivision[]): EmployeeDivision[] {
  const order: EmployeeDivision[] = ['SECURITE', 'SIGNALISATION'];
  return order.filter((d) => list.includes(d));
}
