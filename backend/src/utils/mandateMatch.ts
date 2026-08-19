/**
 * Jumelage candidat ↔ mandat.
 *
 * Volontairement SANS psychométrie : uniquement des critères vérifiables
 * (permis, véhicule, langue, disponibilité) et la distance. C'est ce qui rend le
 * classement explicable à un répartiteur — et défendable, puisqu'aucun critère
 * ici n'est un motif protégé par la Charte.
 *
 * Deux principes qui expliquent la forme du code :
 *
 *  1. **Les exigences filtrent, elles ne pondèrent pas.** Un candidat sans BSP
 *     n'est pas « moins bon », il est inéligible. Mélanger les deux dans un score
 *     unique produirait des classements absurdes (un candidat très proche mais
 *     sans permis remonterait au-dessus d'un candidat qualifié à 20 km).
 *
 *  2. **Pas de pourcentage de compatibilité.** On renvoie une distance, des
 *     raisons en clair et des blocages nommés. Un « compatible à 87 % » n'est ni
 *     vérifiable ni contestable par la personne concernée.
 *
 * La distance a le premier rang parce qu'elle est déjà en base, gratuite et
 * non falsifiable — contrairement à tout ce qu'un candidat déclare lui-même.
 */
import { haversineKm, LatLng } from './geo';

/** Le mandat, côté exigences. Toutes les cotes de contexte sont hors sujet ici. */
export interface MandateRequirements {
  requiresBSP: boolean;
  requiresDriverLicense: boolean;
  requiresVehicle: boolean;
  /** Codes normalisés : 'FR' | 'EN' | … Vide = aucune exigence. */
  requiredLanguages: string[];
  shiftDays: boolean;
  shiftEvenings: boolean;
  shiftNights: boolean;
  shiftWeekends: boolean;
  lat: number | null;
  lng: number | null;
}

export interface CandidateLanguage {
  language: string;
  /** DEBUTANT | INTERMEDIAIRE | AVANCE | BILINGUE | LANGUE_MATERNELLE */
  level: string | null;
}

export interface CandidateForMatch {
  id: string;
  hasBSP: boolean;
  bspExpiryDate: Date | null;
  hasDriverLicense: boolean;
  hasVehicle: boolean;
  languages: CandidateLanguage[];
  available24_7: boolean;
  availableDays: boolean;
  availableEvenings: boolean;
  availableNights: boolean;
  availableWeekends: boolean;
  canTravelKm: number | null;
  lat: number | null;
  lng: number | null;
}

export interface MandateMatch {
  candidateId: string;
  eligible: boolean;
  /** Raisons de l'exclusion, en français, prêtes à afficher. Vide si éligible. */
  blockers: string[];
  /** Points positifs et mises en garde (BSP bientôt expiré…). */
  reasons: string[];
  /** null quand le candidat ou le mandat n'est pas géolocalisé. */
  distanceKm: number | null;
}

/** Un BSP qui expire dans moins de 60 jours mérite un avertissement, pas un blocage. */
const BSP_WARN_DAYS = 60;

/** Un débutant ne « parle » pas la langue au sens d'un mandat bilingue. */
const WEAK_LANGUAGE_LEVEL = 'DEBUTANT';

/**
 * Normalise un libellé de langue saisi librement ('Français', 'anglais',
 * 'English'…) vers un code court. Renvoie la valeur nettoyée en majuscules si
 * elle n'est pas reconnue, plutôt que null : mieux vaut une exigence qui ne
 * matche pas qu'une exigence silencieusement ignorée.
 */
export function normalizeLanguageCode(raw: string | null | undefined): string {
  const t = (raw || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  if (!t) return '';
  if (/^fr|franc/.test(t)) return 'FR';
  if (/^en|angl|engl/.test(t)) return 'EN';
  if (/^es|espagn|spanish|castell/.test(t)) return 'ES';
  if (/^ar|arabe|arabic/.test(t)) return 'AR';
  if (/^cr|creole|kreyol/.test(t)) return 'HT';
  return t.toUpperCase();
}

/** Langues réellement utilisables par le candidat (le niveau débutant ne compte pas). */
export function usableLanguageCodes(languages: CandidateLanguage[]): Set<string> {
  const codes = new Set<string>();
  for (const l of languages) {
    if ((l.level || '').toUpperCase() === WEAK_LANGUAGE_LEVEL) continue;
    const code = normalizeLanguageCode(l.language);
    if (code) codes.add(code);
  }
  return codes;
}

const SHIFT_LABELS: Record<string, string> = {
  shiftDays: 'jour',
  shiftEvenings: 'soir',
  shiftNights: 'nuit',
  shiftWeekends: 'fin de semaine',
};

/**
 * Quarts du mandat que le candidat ne couvre pas.
 *
 * S'appuie sur les mêmes drapeaux que `utils/availability.ts`, où la règle
 * « 24/7 implique les 4 quarts » est déjà appliquée à l'écriture — donc pas
 * besoin de traiter available24_7 à part ici. Un mandat sans aucun quart coché
 * n'exclut personne : c'est un mandat pas encore renseigné, pas un mandat sans
 * besoin.
 */
export function missingShifts(
  mandate: Pick<MandateRequirements, 'shiftDays' | 'shiftEvenings' | 'shiftNights' | 'shiftWeekends'>,
  candidate: Pick<
    CandidateForMatch,
    'available24_7' | 'availableDays' | 'availableEvenings' | 'availableNights' | 'availableWeekends'
  >
): string[] {
  const pairs: Array<[keyof typeof SHIFT_LABELS, boolean]> = [
    ['shiftDays', candidate.availableDays],
    ['shiftEvenings', candidate.availableEvenings],
    ['shiftNights', candidate.availableNights],
    ['shiftWeekends', candidate.availableWeekends],
  ];

  const missing: string[] = [];
  for (const [key, covered] of pairs) {
    if (!mandate[key as keyof typeof mandate]) continue;
    // Filet : une fiche écrite avant la normalisation peut porter 24/7 sans les
    // 4 quarts. On refuse de l'exclure à tort.
    if (covered || candidate.available24_7) continue;
    missing.push(SHIFT_LABELS[key]);
  }
  return missing;
}

/**
 * Évalue un candidat pour un mandat. Ne jette jamais : un mandat incomplet ou un
 * candidat sans coordonnées produit un résultat exploitable, avec l'inconnue
 * signalée plutôt que devinée.
 */
export function matchCandidateToMandate(
  candidate: CandidateForMatch,
  mandate: MandateRequirements,
  now: Date = new Date()
): MandateMatch {
  const blockers: string[] = [];
  const reasons: string[] = [];

  // ── BSP ────────────────────────────────────────────────────────────────────
  if (mandate.requiresBSP) {
    if (!candidate.hasBSP) {
      blockers.push('BSP manquant');
    } else if (candidate.bspExpiryDate && candidate.bspExpiryDate.getTime() < now.getTime()) {
      blockers.push('BSP expiré');
    } else {
      reasons.push('BSP valide');
      if (candidate.bspExpiryDate) {
        const days = Math.floor(
          (candidate.bspExpiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        );
        if (days <= BSP_WARN_DAYS) reasons.push(`BSP à renouveler dans ${days} j`);
      }
    }
  }

  // ── Permis et véhicule ─────────────────────────────────────────────────────
  if (mandate.requiresDriverLicense && !candidate.hasDriverLicense) {
    blockers.push('Permis de conduire requis');
  }
  if (mandate.requiresVehicle && !candidate.hasVehicle) {
    blockers.push('Véhicule requis');
  }

  // ── Langues ────────────────────────────────────────────────────────────────
  if (mandate.requiredLanguages.length > 0) {
    const spoken = usableLanguageCodes(candidate.languages);
    const missing = mandate.requiredLanguages
      .map((l) => normalizeLanguageCode(l))
      .filter((code) => code && !spoken.has(code));
    if (missing.length > 0) {
      blockers.push(`Langue requise : ${missing.join(', ')}`);
    }
  }

  // ── Quarts ─────────────────────────────────────────────────────────────────
  const shiftGaps = missingShifts(mandate, candidate);
  if (shiftGaps.length > 0) {
    blockers.push(`Non disponible : ${shiftGaps.join(', ')}`);
  } else if (candidate.available24_7) {
    reasons.push('Disponible 24/7');
  }

  // ── Distance ───────────────────────────────────────────────────────────────
  let distanceKm: number | null = null;
  if (
    mandate.lat != null &&
    mandate.lng != null &&
    candidate.lat != null &&
    candidate.lng != null
  ) {
    const site: LatLng = { lat: mandate.lat, lng: mandate.lng };
    distanceKm = Math.round(haversineKm({ lat: candidate.lat, lng: candidate.lng }, site) * 10) / 10;

    // Le rayon déclaré par le candidat est une contrainte qu'il a lui-même
    // posée : la dépasser, c'est proposer un poste qu'il a déjà refusé d'avance.
    if (candidate.canTravelKm != null && distanceKm > candidate.canTravelKm) {
      blockers.push(`Hors du rayon accepté (${candidate.canTravelKm} km)`);
    }
    // La distance connue n'est PAS ajoutée aux `reasons` : elle est déjà une
    // donnée structurée (`distanceKm`), et la répéter en texte la ferait
    // afficher deux fois dans la même ligne de tableau.
  } else {
    reasons.push('Distance inconnue');
  }

  return { candidateId: candidate.id, eligible: blockers.length === 0, blockers, reasons, distanceKm };
}

/**
 * Trie les résultats : les plus proches d'abord, distance inconnue en dernier.
 *
 * Une distance manquante n'est pas une mauvaise distance — la reléguer en fin de
 * liste évite qu'un candidat non géocodé squatte la première place, sans pour
 * autant l'écarter. Départage par identifiant pour un ordre stable d'un appel à
 * l'autre.
 */
export function compareMatches(a: MandateMatch, b: MandateMatch): number {
  if (a.distanceKm == null && b.distanceKm == null) return a.candidateId < b.candidateId ? -1 : 1;
  if (a.distanceKm == null) return 1;
  if (b.distanceKm == null) return -1;
  if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
  return a.candidateId < b.candidateId ? -1 : 1;
}

/**
 * Compte les candidats exclus par motif — ce que le répartiteur veut vraiment
 * savoir quand une liste revient courte (« 42 exclus : BSP manquant » explique
 * bien mieux qu'une liste vide).
 */
export function summarizeBlockers(matches: MandateMatch[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of matches) {
    for (const b of m.blockers) {
      // Le rayon porte une valeur variable : on regroupe sous un libellé unique.
      const key = b.startsWith('Hors du rayon') ? 'Hors du rayon accepté' : b;
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}
