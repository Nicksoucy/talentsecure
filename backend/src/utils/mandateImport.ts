/**
 * Helpers PURS (sans Prisma/IO) de l'import des mandats — parsing des lignes de
 * l'export Agendrix « Ressources » (Nom, Identificateur unique, Adresse,
 * Description). La colonne Description (secrets : mots de passe, codes de portes)
 * n'est JAMAIS lue ici.
 *
 * Testés unitairement (src/__tests__/mandate-import.test.ts).
 */
import { parseAgendrixAddress, ParsedAddress } from './agendrixImport';

export interface MandateRow {
  rowNumber: number;
  externalId: string;
  name: string;
  rawAddress: string | null;
  parsed: ParsedAddress;
  /** Vrai si l'adresse est inutilisable (vide, « f », mono-caractère) → non plaçable. */
  unplaceable: boolean;
}

/** Adresse inexploitable pour le géocodage (placeholders « f », mono-caractère, vide). */
function isUnusableAddress(raw: string | null): boolean {
  if (!raw) return true;
  const s = raw.trim();
  // « f », « x », « - », un seul caractère, ou pas la moindre lettre/chiffre significatif.
  return s.length <= 1 || !/[a-zA-Z0-9]{2,}/.test(s);
}

/**
 * Cellules brutes d'une ligne (colonnes Nom, Identificateur, Adresse, [Description
 * ignorée]) → ligne normalisée, ou { skipped } pour les lignes vides et celles
 * sans identifiant ou sans nom (pas un vrai mandat).
 */
export function normalizeMandateRow(
  cells: (string | null | undefined)[],
  rowNumber: number
): MandateRow | { skipped: string } {
  const text = (i: number) => String(cells[i] ?? '').trim();

  const name = text(0);
  const externalId = text(1);
  if (!name && !externalId) return { skipped: 'ligne vide' };
  if (!externalId) return { skipped: `sans identifiant unique (« ${name} »)` };
  if (!name) return { skipped: `sans nom (${externalId})` };

  const rawAddress = text(2) || null;
  const unusable = isUnusableAddress(rawAddress);

  return {
    rowNumber,
    externalId,
    name,
    rawAddress: unusable ? null : rawAddress,
    parsed: unusable
      ? { address: null, city: null, province: 'QC', postalCode: null }
      : parseAgendrixAddress(rawAddress),
    unplaceable: unusable,
  };
}

export interface MandateSnapshot {
  id: string;
  externalId: string;
  name: string;
  address: string | null;
  city: string | null;
  province: string;
  postalCode: string | null;
}

export interface MandateUpdatePlan {
  data: Record<string, unknown>;
  changes: string[];
  addressChanged: boolean;
}

const normPostal = (s?: string | null) => (s || '').replace(/\s+/g, '').toUpperCase();

/**
 * Fusion d'un mandat existant ← ligne du fichier (l'export Agendrix fait foi pour
 * nom + adresse). Retourne null si rien ne change.
 */
export function computeMandateUpdate(
  existing: MandateSnapshot,
  row: MandateRow
): MandateUpdatePlan | null {
  const data: Record<string, unknown> = {};
  const changes: string[] = [];
  const set = (field: keyof MandateSnapshot, value: unknown) => {
    data[field] = value;
    changes.push(`${field}: ${JSON.stringify(existing[field] ?? null)} → ${JSON.stringify(value)}`);
  };

  if (row.name !== existing.name) set('name', row.name);

  let addressChanged = false;
  const p = row.parsed;
  if ((p.address || null) !== (existing.address || null)) {
    set('address', p.address);
    addressChanged = true;
  }
  if ((p.city || null) !== (existing.city || null)) {
    set('city', p.city);
    addressChanged = true;
  }
  if (normPostal(p.postalCode) !== normPostal(existing.postalCode)) {
    set('postalCode', p.postalCode);
    addressChanged = true;
  }
  if (p.province !== (existing.province || 'QC')) {
    set('province', p.province);
    addressChanged = true;
  }

  if (changes.length === 0) return null;
  return { data, changes, addressChanged };
}
