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

/**
 * Clé normalisée pour le regroupement : minuscules, sans accents, sans suffixe.
 * + unifie les séparateurs (- ' .) et expand St/Ste → Saint/Sainte, pour que
 * « Trois Rivieres » = « Trois-Rivières » et « St-Jerome » = « Saint-Jérôme ».
 */
export function normalizeCityKey(city?: string | null): string {
  let k = stripSuffix(city || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // accents
  k = k.replace(/[-'.]/g, ' ').replace(/\s+/g, ' ').trim(); // séparateurs unifiés
  k = k.replace(/\bste\b/g, 'sainte').replace(/\bst\b/g, 'saint'); // abréviations
  return k;
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

// Alias manuels : variantes mal orthographiées / borough avec suffixe →
// vraie ville (qui existe dans le seed). La clé est normalisée à la volée.
const CITY_ALIASES: Record<string, string> = {
  'Sherbrook': 'Sherbrooke',
  'Drommundoville': 'Drummondville',
  'Longueuill': 'Longueuil',
  'Pointes aux trembles': 'Pointe-aux-Trembles',
  'Montreal North': 'Montréal-Nord',
  'Laval Des Rapide': 'Laval',
  'Laval-des-Rapides': 'Laval',
  'Abjou': 'Anjou',
  'Anjou, MONTREAL': 'Anjou',
  'Hampstead Montreal': 'Hampstead',
  'Val Bélaire': 'Val-Bélair',
  'Cantonville': 'Granby',
  '515 4e Avenue Saint-Jean-Sur-Richelieu': 'Saint-Jean-sur-Richelieu',
  'Lac Beaupirt': 'Lac-Beauport',
  'Nepean, Ottawa': 'Ottawa',
};
for (const [variant, canonical] of Object.entries(CITY_ALIASES)) {
  seedCanonicalByKey.set(normalizeCityKey(variant), canonical);
}

/** Nom canonique si la clé est EXACTEMENT dans le seed/alias, sinon null. */
export function seedCanonicalName(key: string): string | null {
  return seedCanonicalByKey.get(key) || null;
}

/** Distance de Levenshtein (bornée — suffisant pour des noms de villes). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99; // trop différent → on coupe court
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[i - 1], dp[i]) + 1;
      prev = tmp;
    }
  }
  return dp[m];
}

/**
 * Résout le nom canonique d'une ville : correspondance EXACTE (seed/alias) →
 * sinon correspondance APPROXIMATIVE sur le seed (faute de frappe) → sinon null.
 * Gardes anti-faux-match : longueur ≥ 5, même 1ʳᵉ lettre, distance ≤ 1 (noms
 * courts) / ≤ 2 (noms longs), et match UNIQUE (sinon on ne corrige pas).
 */
export function resolveCanonical(city?: string | null): string | null {
  const key = normalizeCityKey(city);
  if (!key) return null;
  const exact = seedCanonicalByKey.get(key);
  if (exact) return exact;

  if (key.length < 5) return null; // trop court pour un fuzzy sûr
  const maxDist = key.length >= 8 ? 2 : 1;
  let best: string | null = null;
  let bestDist = maxDist + 1;
  let tie = false;
  for (const [seedKey, name] of seedCanonicalByKey) {
    if (seedKey[0] !== key[0]) continue; // même 1ʳᵉ lettre
    const d = levenshtein(key, seedKey);
    if (d < bestDist) {
      bestDist = d;
      best = name;
      tie = false;
    } else if (d === bestDist) {
      tie = true;
    }
  }
  return best && bestDist <= maxDist && !tie ? best : null;
}

/**
 * Nom canonique pour une ville saisie : seed/alias exact OU faute de frappe
 * corrigée (resolveCanonical) → orthographe canonique ; sinon version « propre ».
 */
export function canonicalCity(city?: string | null): string {
  const tidy = tidyCity(city);
  if (!tidy) return tidy;
  return resolveCanonical(city) ?? tidy;
}
