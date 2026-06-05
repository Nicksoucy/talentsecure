/**
 * Normalisation des noms de villes (saisie manuelle incohérente : accents,
 * casse, tirets, suffixes « , QC »…).
 *
 * - normalizeCityKey : clé de regroupement (carte / dédoublonnage / géocodage).
 * - tidyCity         : version affichable propre (garde casse + accents).
 * - canonicalCity    : nom canonique (seed connu avec accents, sinon tidy).
 *
 * Le seed canonique vient de src/data/quebecCities.ts (mêmes coords que la carte).
 */
import { quebecCitiesCoordinates } from '../data/quebecCities';

/**
 * Compresse les espaces et retire DE FAÇON RÉPÉTÉE les suffixes province/pays
 * en fin de chaîne (gère les suffixes empilés : « Montréal, Québec, Canada »,
 * les variantes « Q.C », « QC », « qc. », et le « City » anglais final
 * « Québec City »/« Quebec City » → « Québec »).
 */
function stripSuffix(s: string): string {
  let out = (s || '').replace(/\s+/g, ' ').trim();
  const re = /[,\s]+\(?\s*(q\.?c\.?|québec|quebec|canada|city)\s*\)?$/i;
  let prev: string;
  do {
    prev = out;
    out = out.replace(re, '').trim();
  } while (out !== prev && out.length > 0);
  return out;
}

/** Clé normalisée : minuscules, sans accents, sans suffixe, espaces compressés. */
export function normalizeCityKey(city?: string | null): string {
  const base = stripSuffix(city || '');
  return base
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Version affichable propre (trim + espaces + retrait suffixe), casse/accents gardés. */
export function tidyCity(city?: string | null): string {
  return stripSuffix(city || '');
}

// Carte inverse : clé normalisée → nom canonique du seed (avec accents).
const seedCanonicalByKey = new Map<string, string>();
for (const name of Object.keys(quebecCitiesCoordinates)) {
  seedCanonicalByKey.set(normalizeCityKey(name), name);
}

/** Nom canonique d'une clé si elle est dans le seed, sinon null. */
export function seedCanonicalName(key: string): string | null {
  return seedCanonicalByKey.get(key) || null;
}

/**
 * Nom canonique pour une ville saisie : si connue du seed → orthographe
 * canonique (avec accents) ; sinon → version « propre » telle que saisie.
 */
export function canonicalCity(city?: string | null): string {
  const tidy = tidyCity(city);
  if (!tidy) return tidy;
  const seed = seedCanonicalByKey.get(normalizeCityKey(tidy));
  return seed || tidy;
}
