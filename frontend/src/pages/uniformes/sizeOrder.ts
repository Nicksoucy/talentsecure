/**
 * Tri universel des grandeurs d'uniforme. Ordre logique « petit → grand » :
 *   lettres  : XS < S < M < L < XL < 2XL < 3XL < 4XL < 5XL < 6XL
 *   pantalons: 28 < 30 < 32 … (numériques croissantes)
 *   hybrides : « Medium 32 » < « Large 36 » < « XL 40 » (par le tour de taille)
 *   « Unique » / vide : à la fin.
 *
 * Remplace les tris alphabétiques (qui donnaient 2XL, 3XL, … L, M, S, XL, XS).
 */

const LETTER_RANK: Record<string, number> = {
  XS: 0, S: 1, M: 2, L: 3, XL: 4,
  XXL: 5, '2XL': 5, XXXL: 6, '3XL': 6, '4XL': 7, '5XL': 8, '6XL': 9,
};

interface SizeKey { bucket: number; value: number; label: string }

function sizeKey(size: string): SizeKey {
  const s = (size || '').trim().toUpperCase();
  if (!s || /^UNIQU/.test(s) || s === '—') return { bucket: 3, value: 0, label: s };
  // Pantalon / hybride : présence d'un tour de taille (nombre à 2-3 chiffres).
  const num = s.match(/\b(\d{2,3})\b/);
  if (num) return { bucket: 1, value: parseInt(num[1], 10), label: s };
  if (LETTER_RANK[s] !== undefined) return { bucket: 0, value: LETTER_RANK[s], label: s };
  return { bucket: 2, value: 0, label: s };
}

/** Comparateur de grandeurs (petit → grand). */
export function compareSizes(a: string, b: string): number {
  const ka = sizeKey(a);
  const kb = sizeKey(b);
  if (ka.bucket !== kb.bucket) return ka.bucket - kb.bucket;
  if (ka.value !== kb.value) return ka.value - kb.value;
  return ka.label.localeCompare(kb.label, 'fr', { numeric: true });
}

/** Trie une liste d'objets selon leur grandeur (petit → grand). Non mutant. */
export function sortBySize<T>(arr: T[], getSize: (x: T) => string): T[] {
  return [...arr].sort((a, b) => compareSizes(getSize(a), getSize(b)));
}

/** Une grandeur correspond-elle à un pantalon (numérique ou hybride) ? */
export const isPantsSize = (s: string) => /\b\d{2,3}\b/.test((s || '').trim());

/**
 * Barèmes proposés à l'ajout d'une grandeur. « pantsStandard » = anciennes
 * grandeurs (style chinois) ; « pantsNew » = nouvelles grandeurs achetées.
 */
export const SIZE_OPTIONS = {
  tops: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'],
  pantsStandard: ['28', '30', '32', '34', '36', '38', '40', '42', '44'],
  pantsNew: ['Medium 32', 'Medium 34', 'Large 36', 'Large 38', 'XL 40', 'XL 42'],
};

export interface SizeOption { value: string; group: string }
/** Liste à plat (avec groupe) pour un Autocomplete groupé. */
export const SIZE_OPTION_LIST: SizeOption[] = [
  ...SIZE_OPTIONS.tops.map((value) => ({ value, group: 'Hauts (lettres)' })),
  ...SIZE_OPTIONS.pantsStandard.map((value) => ({ value, group: 'Pantalons — standard (chinois)' })),
  ...SIZE_OPTIONS.pantsNew.map((value) => ({ value, group: 'Pantalons — nouvelles grandeurs' })),
];
