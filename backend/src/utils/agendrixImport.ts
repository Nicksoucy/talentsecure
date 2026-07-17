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
const PROVINCE_WORD_RE = /^(qc|q[cu][eé]bec|province de qu[eé]bec)$/i;

/** Vrai si le segment est un mot de province (QC / Québec / Quebec / Qc). */
function isProvinceWord(s: string): boolean {
  return PROVINCE_WORD_RE.test(s.trim().normalize('NFC'));
}

/**
 * Découpe une « Adresse municipale » Agendrix best-effort.
 * Gère : « 2675 Bd Pie-IX, Montréal, QC H1V 2E8 », « 4710 Boul Décarie,
 * Montréal QC H3X 2H5, Canada », « 5-1655,Rue Mullins, Montréal,QC »,
 * « 4050 Rue prieur Est Montréal Nord Québec » (sans virgules),
 * « 350 rue evangeline l'assomption » (minuscules), ville/CP absents, etc.
 * Province : code postal prioritaire, sinon QC.
 */
export function parseAgendrixAddress(raw?: string | null): ParsedAddress {
  const empty: ParsedAddress = { address: null, city: null, province: 'QC', postalCode: null };
  let s = (raw || '').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  if (!s) return empty;

  // 1) Code postal (retiré de la chaîne, normalisé « H1V 2E8 »).
  let postalCode: string | null = null;
  const pm = s.match(POSTAL_RE);
  if (pm) {
    postalCode = `${pm[1]} ${pm[2]}`.toUpperCase();
    s = (s.slice(0, pm.index) + s.slice((pm.index ?? 0) + pm[0].length)).trim();
  }

  // 2) Segments par virgules, sans « Canada » ni mots de province isolés.
  let segments = s
    .split(',')
    .map((p) => p.trim().replace(/[\s,]+$/g, ''))
    .filter(Boolean)
    .filter((p) => !/^canada$/i.test(p))
    .filter((p) => !isProvinceWord(p));

  // Suffixe de province collé au segment (« Montréal QC », « Montréal Qc »).
  segments = segments
    .map((p) => p.replace(/\s+(qc|q[cu][eé]bec)\s*$/i, '').trim())
    .filter(Boolean);

  if (segments.length === 0) return { ...empty, postalCode };

  let city: string | null = null;
  let addressParts: string[];

  if (segments.length >= 2) {
    // Dernier segment sans chiffre = ville (« Appartement 822 » reste dans la rue).
    const last = segments[segments.length - 1];
    if (!/\d/.test(last)) {
      city = last;
      addressParts = segments.slice(0, -1);
    } else {
      addressParts = segments;
    }
  } else {
    // Un seul segment (aucune virgule) : cherche une ville connue en fin de
    // chaîne (« … Montréal Nord Québec », « … l'assomption ») — suffixe le plus
    // long d'abord, jamais de mot contenant un chiffre.
    const words = segments[0].split(' ').filter(Boolean);
    while (words.length > 1 && isProvinceWord(words[words.length - 1])) words.pop();
    let matched: { city: string; take: number } | null = null;
    const maxTake = Math.min(4, words.length - 1);
    for (let take = maxTake; take >= 1 && !matched; take--) {
      const tail = words.slice(words.length - take);
      if (tail.some((w) => /\d/.test(w))) continue;
      const resolved = resolveCanonical(tail.join(' '));
      if (resolved) matched = { city: resolved, take };
    }
    if (matched) {
      city = matched.city;
      addressParts = [words.slice(0, words.length - matched.take).join(' ')];
    } else {
      addressParts = [words.join(' ')];
    }
  }

  const address = addressParts.join(', ').trim() || null;
  const cityClean = city ? canonicalCity(city) : '';
  return {
    address,
    city: cityClean || null,
    province: resolveProvince({ postalCode }),
    postalCode,
  };
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

/**
 * Cellules brutes d'une ligne (10 colonnes, chaînes) → ligne normalisée, ou
 * { skipped } pour les lignes vides et les comptes département (« Comptabilité
 * Xguard », « RH XGuard », … — Prénom ou Nom == « xguard »).
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

  if (firstName.toLowerCase() === 'xguard' || lastName.toLowerCase() === 'xguard') {
    return { skipped: `compte département (${rawFirst} ${rawLast})` };
  }

  const email = text(3).toLowerCase() || null;

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

const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');

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
