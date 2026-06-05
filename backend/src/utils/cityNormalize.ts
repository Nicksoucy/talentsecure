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
 * Répare le « mojibake » français : accents corrompus par un double encodage
 * UTF-8 (ex. « Montrã©Al » → « Montréal », « Trois-Riviã¨Res » → « Trois-Rivières »).
 * Gère les préfixes Ã (U+00C3) et ã (U+00E3).
 */
function fixMojibake(s: string): string {
  if (!s || !/[Ãã]/.test(s)) return s; // pas de marqueur → rien à faire
  return s
    .replace(/[Ãã]©/g, 'é')
    .replace(/[Ãã]¨/g, 'è')
    .replace(/[Ãã]ª/g, 'ê')
    .replace(/[Ãã]«/g, 'ë')
    .replace(/[Ãã]¢/g, 'â')
    .replace(/[Ãã]¤/g, 'ä')
    .replace(/[Ãã]´/g, 'ô')
    .replace(/[Ãã]¶/g, 'ö')
    .replace(/[Ãã]®/g, 'î')
    .replace(/[Ãã]¯/g, 'ï')
    .replace(/[Ãã]§/g, 'ç')
    .replace(/[Ãã]¹/g, 'ù')
    .replace(/[Ãã]»/g, 'û')
    .replace(/[Ãã]¼/g, 'ü')
    .replace(/[Ãã] /g, 'à'); // à (espace insécable)
}

/**
 * Compresse les espaces et retire DE FAÇON RÉPÉTÉE les suffixes province/pays
 * en fin de chaîne (gère les suffixes empilés : « Montréal, Québec, Canada »,
 * les variantes « Q.C », « QC », « qc. », et le « City » anglais final
 * « Québec City »/« Quebec City » → « Québec »).
 */
function stripSuffix(s: string): string {
  let out = fixMojibake(s || '').replace(/\s+/g, ' ').trim();
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
