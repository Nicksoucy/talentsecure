/**
 * Helpers PURS (sans Prisma/IO/réseau) de l'import d'un lot de CV rattaché à un
 * contrat client (ex. « PSB »).
 *
 * Testés unitairement (src/__tests__/contract-cv-import.test.ts) ; le script
 * scripts/import-contract-cvs.ts n'ajoute que l'IO (lecture PDF, DB, rapport).
 *
 * Calibré sur un lot réel de 148 CV Indeed. Deux contraintes en découlent :
 *
 *  1. Le NOM DE FICHIER est inexploitable pour séparer prénom/nom : Indeed
 *     concatène sans séparateur (CVDiederikAndrade.pdf, CVFABRICETAMUKIUR.pdf).
 *     Le nom se lit donc dans la 1re ligne du CV, et le nom de fichier sert de
 *     CONTRE-VÉRIFICATION — deux sources indépendantes qui concordent.
 *
 *  2. L'ADRESSE ne se cherche que dans l'EN-TÊTE, jamais dans tout le document.
 *     Mesuré sur le lot : le document entier donne 59 adresses de rue, l'en-tête
 *     seul 54 — les 5 de différence sont des adresses d'EMPLOYEUR trouvées dans
 *     la section Expérience, qui épingleraient la personne sur son ancien lieu
 *     de travail. On ne devine jamais : mieux vaut pas de pin qu'un faux pin.
 */
import { lastTenDigits } from './phone';
import { parseAgendrixAddress, cleanNameTags, ParsedAddress } from './agendrixImport';
import { canonicalCity, resolveProvince } from './cityNormalize';

// ───────────────────────────────────────────────────────────────────────────
// Normalisation
// ───────────────────────────────────────────────────────────────────────────

/** Minuscules, sans accents ni ponctuation ni espaces — pour comparer des noms. */
export function normalizeNameKey(raw?: string | null): string {
  return (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Casse propre d'un nom : « ABDOU AZIZ GUEYE » → « Abdou Aziz Gueye », en
 * respectant les traits d'union et apostrophes (« Jean-Yves », « O'Brien »).
 * Les CV arrivent en majuscules, en minuscules ou en casse mixte.
 */
export function titleCaseName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/(^|[\s\-'’])([a-zà-ÿ])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nom de fichier → clé de comparaison : retire l'extension, le préfixe « CV »
 * et le suffixe de doublon « (1) » d'Indeed.
 * « CVAméliseMATHIEU (1).pdf » → « amelisemathieu ».
 */
export function fileNameKey(fileName: string): string {
  const base = fileName.replace(/\.[A-Za-z0-9]+$/, '').replace(/\s*\(\d+\)\s*$/, '');
  return normalizeNameKey(base).replace(/^cv/, '');
}

// ───────────────────────────────────────────────────────────────────────────
// Nom : 1re ligne du CV, recoupée avec le nom de fichier
// ───────────────────────────────────────────────────────────────────────────

/**
 * Mots qui ne sont jamais un nom de personne. Sans cette liste, la 1re ligne
 * « PROFIL PROFESSIONNEL » ou « Je présente ma candidature » d'un CV devient un
 * patronyme.
 */
const NAME_STOPWORDS = new Set(
  [
    'profil', 'professionnel', 'professionnelle', 'objectif', 'objectifs', 'contact', 'contacts',
    'competences', 'competence', 'experience', 'experiences', 'formation', 'formations',
    'education', 'etudes', 'resume', 'sommaire', 'summary', 'curriculum', 'vitae', 'cv',
    'candidature', 'presente', 'presentation', 'monsieur', 'madame', 'agent', 'agente',
    'securite', 'gardien', 'gardienne', 'adresse', 'telephone', 'courriel', 'email',
    'langues', 'langue', 'reference', 'references', 'parcours', 'competance',
    'certification', 'certifications', 'diplome', 'diplomes', 'permis', 'atouts', 'qualites',
    'et', 'et/ou', 'a', 'de', 'du',
    'la', 'le', 'les', 'ma', 'mon', 'je', 'auprès', 'aupres', 'objectifprofessionnel',
  ].map((w) => normalizeNameKey(w))
);

/** Une ligne peut-elle être un nom de personne ? (pas de chiffre, ni @, courte) */
export function looksLikeNameLine(line: string): boolean {
  const s = line.trim();
  if (s.length < 2 || s.length > 60) return false;
  if (/[0-9@|•·:/\\]/.test(s)) return false;
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 5) return false;
  // Que des mots alphabétiques (accents, traits d'union, apostrophes admis).
  if (!tokens.every((t) => /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.-]*$/.test(t))) return false;
  // Un seul mot de vocabulaire de CV suffit à disqualifier la ligne.
  return !tokens.some((t) => NAME_STOPWORDS.has(normalizeNameKey(t)));
}

/**
 * Lignes explorées pour retrouver le nom. Large, parce que l'ordre de lecture
 * d'un PDF multi-colonnes est arbitraire : le nom se retrouve régulièrement
 * après les sections « Expérience » ou « Langues ». Seule une correspondance
 * avec le nom de fichier autorise à retenir une ligne aussi basse.
 */
const HEADER_SCAN_LINES = 80;

/** Lignes admissibles pour le REPLI non confirmé (le vrai haut de page). */
const HEADER_FALLBACK_LINES = 8;

/** Toutes les rotations d'une liste de tokens (les CV écrivent NOM Prénom). */
function rotations<T>(items: T[]): T[][] {
  return items.map((_, i) => items.slice(i).concat(items.slice(0, i)));
}

/**
 * Certains CV sont composés lettre par lettre (« F A B R I C E T A M U K I U R »)
 * : l'extracteur PDF rend alors un espace entre chaque caractère, y compris aux
 * frontières de mots. On recolle le tout en un seul bloc — la séparation
 * prénom/nom est ensuite reconstruite depuis le nom de fichier.
 */
export function collapseLetterSpacing(line: string): string {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return line;
  const singles = tokens.filter((t) => t.length === 1).length;
  return singles / tokens.length >= 0.7 ? tokens.join('') : line;
}

/**
 * Rend prénom et nom à partir d'un bloc collé, en s'appuyant sur le nom de
 * fichier comme vérité de terrain : Indeed le nomme prénom+nom, donc le début
 * du bloc doit coïncider avec le début du fichier et sa fin avec la fin du
 * fichier ; ce qui reste au milieu est un second prénom.
 *
 * « ABDOUAZIZGUEYE » + « abdougueye » → ['Abdou Aziz', 'Gueye'].
 */
export function splitBlobUsingFileKey(blob: string, fileKey: string): string[] | null {
  const key = normalizeNameKey(blob);
  if (!key || !fileKey || key.length < 4) return null;

  let prefix = 0;
  while (prefix < key.length && prefix < fileKey.length && key[prefix] === fileKey[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < key.length - prefix &&
    suffix < fileKey.length - prefix &&
    key[key.length - 1 - suffix] === fileKey[fileKey.length - 1 - suffix]
  ) {
    suffix++;
  }

  // Il faut un prénom ET un nom identifiables, et le fichier doit être
  // intégralement expliqué (prefix + suffix), sinon ce n'est pas la même personne.
  if (prefix < 2 || suffix < 2 || prefix + suffix !== fileKey.length) return null;

  const first = blob.slice(0, blob.length - suffix);
  const last = blob.slice(blob.length - suffix);
  return [first, last];
}

/**
 * À quel point cette lecture du nom colle-t-elle au nom de fichier ?
 *   3 = identique · 2 = le fichier omet un 2e prénom · 1 = le fichier est une
 *   partie du nom lu · 0 = aucun rapport.
 *
 * Un score de 0,5 est réservé au cas « le nom lu est INCOMPLET par rapport au
 * fichier » (1re ligne tronquée) : c'est un signal de continuer à chercher, pas
 * une confirmation — c'est ce qui distingue « MARIE-LOU » de
 * « MARIE-LOU ARSENEAU » quand le fichier dit CVMarielouArseneau.
 */
export function nameMatchScore(tokens: string[], fileKey: string): number {
  if (!fileKey) return 0;
  const keys = tokens.map(normalizeNameKey).filter(Boolean);
  if (keys.length === 0) return 0;

  const full = keys.join('');
  if (full === fileKey) return 3;

  // Sous-ensemble ordonné : le fichier reprend certains tokens, dans l'ordre,
  // et les couvre tous (« ahmed|yassine|achab » ↔ « ahmedachab »).
  let rest = fileKey;
  for (const k of keys) {
    if (rest.startsWith(k)) rest = rest.slice(k.length);
  }
  if (rest.length === 0) return 2;

  if (full.includes(fileKey)) return 1;
  if (fileKey.includes(full)) return 0.5; // lecture incomplète
  return 0;
}

export interface ParsedName {
  firstName: string;
  lastName: string;
  /** Le nom de fichier confirme-t-il la lecture ? Sinon → revue manuelle. */
  confirmedByFileName: boolean;
}

/**
 * Extrait le nom des premières lignes du CV.
 *
 * Le nom est souvent réparti sur 2 ou 3 lignes (« MARIE-LOU » / « ARSENEAU »,
 * « ACHELEY » / « ELEAZAR » / « HENRY ») et parfois écrit NOM-en-premier
 * (« WILLIAMSON MICHEL » pour CVMichelWilliamson.pdf). On construit donc toutes
 * les lectures plausibles — 1 à 3 lignes consécutives, dans toutes les
 * rotations de tokens — et on retient celle que le nom de fichier confirme le
 * mieux. Le nom de fichier fixe aussi l'ORDRE : Indeed le nomme prénom+nom.
 *
 * Convention finale : le DERNIER token est le nom de famille.
 */
export function parseNameFromHeader(text: string, fileName: string): ParsedName | null {
  const fileKey = fileNameKey(fileName);
  const lines = text
    .split(/\r?\n/)
    .map((l) => collapseLetterSpacing(l.trim()))
    .filter(Boolean)
    .slice(0, HEADER_SCAN_LINES);

  const readings: string[][] = [];
  const headReadings: string[][] = [];
  // Découpages reconstruits DEPUIS le nom de fichier : fiables par construction,
  // ils court-circuitent le scoring (qui les noterait 0, faute de coïncider
  // token à token avec un fichier sans séparateurs).
  const fromFileName: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!looksLikeNameLine(lines[i])) continue;
    let joined = lines[i].split(/\s+/).filter(Boolean);
    readings.push(joined);
    if (i < HEADER_FALLBACK_LINES) headReadings.push(joined);
    if (joined.length === 1) {
      const split = splitBlobUsingFileKey(joined[0], fileKey);
      if (split) fromFileName.push(split);
    }
    for (let extra = 1; extra <= 2 && i + extra < lines.length; extra++) {
      if (!looksLikeNameLine(lines[i + extra])) break;
      joined = joined.concat(lines[i + extra].split(/\s+/).filter(Boolean));
      if (joined.length <= 5) readings.push(joined);
    }
  }
  if (readings.length === 0 && fromFileName.length === 0) return null;

  // Meilleure lecture, toutes rotations confondues. À score égal, la lecture
  // la plus complète (le plus de tokens) l'emporte.
  let best: { tokens: string[]; score: number } | null =
    fromFileName.length > 0 ? { tokens: fromFileName[0], score: 3 } : null;
  for (const reading of readings) {
    for (const rotated of rotations(reading)) {
      const score = nameMatchScore(rotated, fileKey);
      if (!best || score > best.score || (score === best.score && rotated.length > best.tokens.length)) {
        best = { tokens: rotated, score };
      }
    }
  }
  if (!best) return null;

  // Aucune lecture ne colle au nom de fichier : on retombe sur la 1re ligne
  // nommable de l'EN-TÊTE (pas sur une ligne trouvée au fond du document), non
  // confirmée — elle partira en revue manuelle plutôt qu'en création aveugle.
  if (best.score < 2 && headReadings.length === 0) return null;
  const tokens = best.score >= 2 ? best.tokens : headReadings[0];

  // Un « (PSB) » ou « (EE) » collé au nom devient un tag, pas un patronyme.
  const cleaned = cleanNameTags(tokens.join(' ')).name.split(/\s+/).filter(Boolean);
  if (cleaned.length < 2) return null; // Prénom + nom exigés.

  const last = cleaned[cleaned.length - 1];
  const first = cleaned.slice(0, -1).join(' ');

  return {
    firstName: titleCaseName(first),
    lastName: titleCaseName(last),
    confirmedByFileName: best.score >= 2,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Zone d'en-tête : tout ce qui précède la 1re section « Expérience/Formation »
// ───────────────────────────────────────────────────────────────────────────

const SECTION_RE =
  /^\s*(exp[ée]riences?|parcours|emplois?|work\s+experience|employment|professional\s+experience|formations?|[ée]tudes?|education|scolarit[ée])\b/im;

/** Longueur d'en-tête retenue quand le CV n'a aucun titre de section reconnu. */
const HEADER_FALLBACK_CHARS = 900;

/**
 * Zone où l'adresse est CELLE DE LA PERSONNE. Au-delà du 1er titre de section,
 * toute adresse est celle d'un employeur ou d'une école.
 */
export function headerZone(text: string): string {
  const m = text.match(SECTION_RE);
  return m && m.index != null ? text.slice(0, m.index) : text.slice(0, HEADER_FALLBACK_CHARS);
}

// ───────────────────────────────────────────────────────────────────────────
// Coordonnées : courriel, téléphone, code postal, ville, adresse de rue
// ───────────────────────────────────────────────────────────────────────────

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
// Domaines qui ne sont jamais l'adresse personnelle du candidat.
const EMAIL_BLOCKLIST = /@(example\.|linkedin\.|indeed\.|sentry\.|domain\.|email\.com)/i;

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/;
const POSTAL_RE = /\b([A-Za-z]\d[A-Za-z])[ -]?(\d[A-Za-z]\d)\b/;

// « Ville, QC » / « Ville, Québec » — la forme la plus fréquente sur les CV.
const CITY_QC_RE = /([A-ZÀ-Ü][A-Za-zÀ-ÿ'’\-. ]{2,30}?)\s*,\s*(?:QC|Qu[ée]bec|Quebec)\b/;

// Numéro civique + type de voie. Deux ordres à couvrir :
//   FR — le type précède le nom : « 880, boul. Iberville », « 12105 Rue Prieur »
//   EN — le type suit le nom    : « 25 Main Street », « 40 Sunnybrooke Road »
const STREET_TYPE_FR =
  'rue|av\\.?|avenue|boul\\.?|boulevard|bd|ch\\.?|chemin|route|rte|mont[ée]e|place|pl\\.?|croissant|rang|terrasse|impasse';
const STREET_TYPE_EN = 'street|st\\.?|ave\\.?|avenue|road|rd\\.?|drive|dr\\.?|blvd|way|crescent|court|lane';
const CIVIC = '\\b\\d{1,5}(?:[-–]\\d+)?[ ,]+';

const STREET_RE = new RegExp(
  `(?:${CIVIC}(?:${STREET_TYPE_FR})\\b)` +
    `|(?:${CIVIC}[A-Za-zÀ-ÿ'’.-]+(?:\\s+[A-Za-zÀ-ÿ'’.-]+){0,2}\\s+(?:${STREET_TYPE_EN})\\b)`,
  'i'
);

export function extractEmail(text: string): string | null {
  const m = text.match(EMAIL_RE);
  if (!m) return null;
  if (EMAIL_BLOCKLIST.test(m[0])) return null;
  return m[0].toLowerCase();
}

export function extractPhone(text: string): string | null {
  const m = text.match(PHONE_RE);
  if (!m) return null;
  const digits = `${m[1]}${m[2]}${m[3]}`;
  // Un indicatif ne commence jamais par 0/1 ; on écarte aussi les répétitions
  // (0000000000, 1234567890) qui sont des exemples de gabarit.
  if (/^[01]/.test(digits)) return null;
  if (/^(\d)\1{9}$/.test(digits)) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function extractPostalCode(text: string): string | null {
  const m = text.match(POSTAL_RE);
  return m ? `${m[1]} ${m[2]}`.toUpperCase() : null;
}

/**
 * Nettoie une ligne d'adresse : puces de mise en page (« ■ », « • »), étiquette
 * « Adresse : », et fragment de code postal isolé laissé en fin de ligne par la
 * linéarisation d'un PDF multi-colonnes (« …coteau rouge, J4J »).
 */
export function cleanAddressLine(raw: string): string {
  return raw
    .replace(/^[\s\-–—*•·■□▪◦‣>|]+/, '')
    .replace(/^(adresse|address|domicile)\s*[:：]\s*/i, '')
    .replace(/,\s*[A-Za-z]\d[A-Za-z]\s*$/, '') // FSA orpheline en fin de ligne
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ligne d'adresse de rue de l'en-tête (la 1re rencontrée), sinon null. */
export function extractStreetLine(zone: string): string | null {
  for (const rawLine of zone.split(/\r?\n/)) {
    const line = cleanAddressLine(rawLine);
    if (!line || line.length > 120) continue;
    if (STREET_RE.test(line)) return line;
  }
  return null;
}

// Marqueurs d'un EMPLOYEUR (raison sociale, plage de dates d'emploi).
const EMPLOYER_RE =
  /\b(inc\.?|ltée|ltee|s\.?e\.?n\.?c|corp\.?|compagnie|company|employeur|superviseur|g[ée]rant|magasin|\d{2}\/\d{4}\s*[-–]|\d{4}\s*[-–]\s*\d{4})\b/i;

export interface StreetCandidate {
  line: string;
  score: number;
  reasons: string[];
}

/**
 * Cherche l'adresse du DOMICILE dans TOUT le document.
 *
 * La version initiale ne regardait que l'en-tête, en supposant qu'une adresse
 * plus bas appartenait forcément à un employeur. C'était faux : sur une mise en
 * page à DEUX COLONNES, le bloc de coordonnées de droite est linéarisé APRÈS le
 * corps du CV. De vraies adresses de domicile étaient donc écartées (mesuré :
 * 10 personnes du lot PSB, dont une avec « 1860 Rue Wolfe, H2L 3J8, Montréal »
 * collé à son propre téléphone et à son propre courriel).
 *
 * On ne se fie donc plus à la POSITION mais à ce qui entoure l'adresse :
 *   + code postal sur la même ligne ou la suivante      (fort)
 *   + courriel/téléphone de la personne à ±3 lignes     (fort)
 *   − raison sociale ou plage de dates à ±3 lignes      (fort négatif)
 *   + situé en tout début de document                   (faible appoint)
 */
export function findHomeStreetCandidates(
  text: string,
  email: string | null,
  phoneDigits: string
): StreetCandidate[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const out: StreetCandidate[] = [];
  const emailLocal = email ? email.split('@')[0].toLowerCase() : '';

  for (let i = 0; i < lines.length; i++) {
    const line = cleanAddressLine(lines[i]);
    if (!line || line.length > 120 || !STREET_RE.test(line)) continue;

    const reasons: string[] = [];
    let score = 1;

    const sameOrNext = `${lines[i]} ${lines[i + 1] ?? ''}`;
    const around = lines.slice(Math.max(0, i - 3), i + 4).join(' ');

    // Raison sociale SUR LA LIGNE MÊME de l'adresse : c'est l'adresse de
    // l'entreprise, aucun autre indice ne peut racheter ça.
    if (EMPLOYER_RE.test(line)) {
      out.push({ line, score: -Infinity, reasons: ['raison sociale sur la ligne'] });
      continue;
    }

    if (POSTAL_RE.test(sameOrNext)) {
      score += 3;
      reasons.push('code postal');
    }
    if (emailLocal && around.toLowerCase().includes(emailLocal)) {
      score += 2;
      reasons.push('courriel de la personne');
    }
    if (phoneDigits && around.replace(/\D/g, '').includes(phoneDigits)) {
      score += 2;
      reasons.push('téléphone de la personne');
    }
    if (EMPLOYER_RE.test(around)) {
      score -= 3;
      reasons.push('marqueur employeur');
    }
    if (i < 12) {
      score += 1;
      reasons.push('haut de page');
    }

    out.push({ line, score, reasons });
  }

  return out.sort((a, b) => b.score - a.score);
}

/** Score minimal pour retenir une adresse sans revue humaine. */
export const HOME_ADDRESS_MIN_SCORE = 4;

export type LocationPrecision = 'street' | 'postal' | 'city' | 'none';

export interface ParsedCv {
  fileName: string;
  firstName: string;
  lastName: string;
  /** Le nom de fichier confirme-t-il la lecture du nom ? */
  nameConfirmed: boolean;
  email: string | null;
  phone: string | null;
  phoneDigits: string;
  address: string | null;
  city: string | null;
  province: string;
  postalCode: string | null;
  /** Meilleure précision atteignable pour cette personne. */
  precision: LocationPrecision;
  /**
   * Une adresse de rue existe dans le document mais HORS en-tête : c'est
   * probablement celle d'un employeur. Rapportée, jamais utilisée.
   */
  suspectStreetOutsideHeader: string | null;
  warnings: string[];
}

/** Texte de CV trop court pour être exploitable (PDF scanné / image). */
export const MIN_CV_TEXT_CHARS = 200;

export function isUnreadableCv(text: string): boolean {
  return text.trim().length < MIN_CV_TEXT_CHARS;
}

/**
 * Extrait les coordonnées d'un CV. Ne devine JAMAIS : chaque champ absent reste
 * null et alimente `warnings` / `precision`, que le rapport d'import restitue.
 */
export function parseCvContact(text: string, fileName: string): ParsedCv | null {
  const warnings: string[] = [];
  const zone = headerZone(text);

  const name = parseNameFromHeader(text, fileName);
  if (!name || !name.lastName) {
    return null; // Sans nom exploitable → bucket ILLISIBLE côté script.
  }
  if (!name.confirmedByFileName) {
    warnings.push('nom non confirmé par le nom de fichier');
  }

  // Courriel / téléphone : l'en-tête d'abord (les CV les y mettent), puis le
  // document entier — un courriel personnel reste personnel où qu'il soit.
  const email = extractEmail(zone) ?? extractEmail(text);
  const phone = extractPhone(zone) ?? extractPhone(text);
  if (!email) warnings.push('aucun courriel');
  if (!phone) warnings.push('aucun téléphone');

  // Localisation — on cherche dans TOUT le document et on tranche sur le
  // voisinage (code postal, coordonnées de la personne), pas sur la position :
  // un bloc de contact en colonne de droite sort après le corps du CV.
  const phoneDigits = lastTenDigits(phone);
  const best = findHomeStreetCandidates(text, email, phoneDigits)[0];
  const streetLine = best && best.score >= HOME_ADDRESS_MIN_SCORE ? best.line : null;

  const postalCode = extractPostalCode(zone) ?? (streetLine ? extractPostalCode(streetLine) : null);
  // Repli « Ville, QC » : l'en-tête d'abord, puis le reste du document — mais
  // JAMAIS depuis une ligne portant une raison sociale, sinon on épinglerait la
  // personne dans la ville de son employeur.
  const cityMatch =
    zone.match(CITY_QC_RE) ??
    text
      .split(/\r?\n/)
      .filter((l) => !EMPLOYER_RE.test(l))
      .map((l) => l.match(CITY_QC_RE))
      .find(Boolean) ??
    null;

  let parsed: ParsedAddress = { address: null, city: null, province: 'QC', postalCode: null };
  if (streetLine) {
    parsed = parseAgendrixAddress(streetLine);
  }

  const city = parsed.city ?? (cityMatch ? canonicalCity(cityMatch[1].trim()) : null) ?? null;
  const finalPostal = parsed.postalCode ?? postalCode;

  let precision: LocationPrecision = 'none';
  if (parsed.address) precision = 'street';
  else if (finalPostal) precision = 'postal';
  else if (city) precision = 'city';

  // Adresse repérée mais trop peu étayée pour être retenue : on la SIGNALE
  // (elle peut être celle d'un employeur, ou un domicile mal entouré).
  let suspect: string | null = null;
  if (!streetLine && best) {
    suspect = best.line;
    warnings.push(`adresse peu fiable (${best.reasons.join(', ') || 'aucun indice'}) — à confirmer`);
  }

  if (precision === 'none') warnings.push('aucune localisation exploitable');

  return {
    fileName,
    firstName: name.firstName,
    lastName: name.lastName,
    nameConfirmed: name.confirmedByFileName,
    email,
    phone,
    phoneDigits: lastTenDigits(phone),
    address: parsed.address,
    city: city || null,
    province: resolveProvince({ postalCode: finalPostal }),
    postalCode: finalPostal,
    precision,
    suspectStreetOutsideHeader: suspect,
    warnings,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Décision d'import
// ───────────────────────────────────────────────────────────────────────────

export type ImportDecision =
  | { kind: 'create' }
  | { kind: 'tag-existing'; section: string; personId: string; personName: string }
  | { kind: 'ambiguous'; reason: string; personName?: string }
  | { kind: 'duplicate-in-batch'; firstFile: string };

export interface ExistingMatch {
  section: string;
  id: string;
  firstName: string;
  lastName: string;
}

/** Politique appliquée aux correspondances par NOM SEUL (sans email/tél). */
export type NameMatchPolicy = 'skip' | 'tag' | 'create';

/**
 * Décide du sort d'un CV.
 *
 * Règle centrale : une correspondance par email ou téléphone est fiable → on
 * TAGUE la fiche existante (jamais de doublon). Une correspondance par nom seul
 * ne l'est pas — deux « Mohamed Diallo » ne sont pas la même personne — donc on
 * RAPPORTE sans écrire, sauf décision humaine explicite (--name-match).
 */
export function classifyCv(
  parsed: ParsedCv,
  contactMatch: ExistingMatch | null,
  nameOnlyMatch: ExistingMatch | null,
  nameMatchPolicy: NameMatchPolicy = 'skip'
): ImportDecision {
  if (contactMatch) {
    return {
      kind: 'tag-existing',
      section: contactMatch.section,
      personId: contactMatch.id,
      personName: `${contactMatch.firstName} ${contactMatch.lastName}`.trim(),
    };
  }

  if (nameOnlyMatch) {
    const personName = `${nameOnlyMatch.firstName} ${nameOnlyMatch.lastName}`.trim();
    if (nameMatchPolicy === 'tag') {
      return { kind: 'tag-existing', section: nameOnlyMatch.section, personId: nameOnlyMatch.id, personName };
    }
    if (nameMatchPolicy === 'skip') {
      return {
        kind: 'ambiguous',
        reason: `même nom qu'un ${nameOnlyMatch.section} existant, sans courriel ni téléphone commun`,
        personName,
      };
    }
    // 'create' : l'opérateur a tranché, ce sont deux personnes distinctes.
  }

  // Sans courriel NI téléphone, on ne peut pas garantir l'absence de doublon.
  if (!parsed.email && !parsed.phone && nameMatchPolicy === 'skip') {
    return { kind: 'ambiguous', reason: 'ni courriel ni téléphone — dédoublonnage impossible' };
  }

  return { kind: 'create' };
}

/** Clé de dédup à l'intérieur du lot : courriel, sinon téléphone, sinon nom. */
export function batchKey(parsed: ParsedCv): string {
  if (parsed.email) return `e:${parsed.email}`;
  if (parsed.phoneDigits) return `p:${parsed.phoneDigits}`;
  return `n:${normalizeNameKey(`${parsed.firstName}${parsed.lastName}`)}`;
}
