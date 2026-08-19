/**
 * Calcul des scores du questionnaire, contrôle qualité des réponses, et écarts
 * personne ↔ site.
 *
 * Trois partis pris qui expliquent la forme du code :
 *
 * 1. **Aucune norme importée.** Les scores restent sur l'échelle brute 1-5. On
 *    ne convertit ni en percentile ni en « 87 % de compatibilité » : il n'existe
 *    aucune norme québécoise validée pour cette population, et l'IPIP refuse par
 *    principe d'en publier, en recommandant des normes locales. Tant qu'il n'y a
 *    pas ~100 répondants maison, un percentile serait inventé.
 *
 * 2. **Écart directionnel, jamais de distance euclidienne.** On ne pénalise que
 *    le DÉFICIT par rapport à ce que le site exige, jamais l'excès. Les scores
 *    de différence sont contaminés (Edwards, 1994, 2001) : quelqu'un qui répond
 *    « tout à fait » partout paraîtrait artificiellement proche des mandats
 *    exigeants. Tolérer plus que nécessaire ne coûte rien sur le terrain.
 *
 * 3. **Les écarts n'excluent personne.** Ils s'affichent, ils ne filtrent pas —
 *    contrairement aux critères durs de `mandateMatch.ts`. Un score de
 *    personnalité ne doit jamais être seul ni déterminant dans une décision
 *    d'emploi (CDPDJ, 1998, recommandation 7).
 */
import {
  ALL_ITEMS,
  ITEM_IDS,
  TRAIT_ITEMS,
  TRAIT_KEYS,
  PREFERENCE_KEYS,
  PREFERENCE_ITEMS,
  PREFERENCE_TO_MANDATE_FIELD,
  SCALE_MIN,
  SCALE_MAX,
  type PreferenceKey,
  type TraitKey,
} from './questionnaireItems';

export interface RawAnswer {
  itemId: string;
  value: number;
  /** Temps passé sur l'énoncé, en millisecondes. Absent = non mesuré. */
  elapsedMs?: number | null;
}

export interface QualityReport {
  answered: number;
  /** Plus longue suite d'énoncés consécutifs répondus à l'identique (bloc traits). */
  longestIdenticalRun: number;
  /** Temps médian par énoncé, en ms. null si aucun temps n'a été mesuré. */
  medianMsPerItem: number | null;
  /** Traits où l'énoncé direct et l'énoncé inversé se contredisent. */
  inconsistentTraits: TraitKey[];
  /** Vrai si au moins un signal de réponse bâclée est présent. */
  careless: boolean;
  /** Motifs, en français, prêts à afficher au personnel RH. */
  flags: string[];
}

export interface QuestionnaireScores {
  preferences: Record<PreferenceKey, number | null>;
  traits: Record<TraitKey, number | null>;
  quality: QualityReport;
}

/** Une suite de 10 réponses identiques sur 20 énoncés n'est plus du hasard. */
const LONG_STRING_THRESHOLD = 10;
/** Sous 2 s par énoncé, on n'a pas lu la phrase. */
const MIN_MS_PER_ITEM = 2000;
/** Sur une échelle 1-5, un écart de plus de 2 entre énoncés directs et inversés
 *  d'un même trait est une contradiction, pas une nuance. */
const INCONSISTENCY_THRESHOLD = 2;
/** Deux traits contradictoires suffisent à douter de l'ensemble. */
const MAX_INCONSISTENT_TRAITS = 1;

/** Valeur d'un énoncé inversé, remise dans le sens de la dimension. */
export function reverseValue(value: number): number {
  return SCALE_MIN + SCALE_MAX - value;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Plus longue suite de réponses identiques, dans l'ORDRE DE PRÉSENTATION des
 * énoncés de trait. L'ordre compte : c'est une suite de clics au même endroit
 * qu'on cherche, pas une répartition de valeurs.
 */
export function longestIdenticalRun(byId: Map<string, number>): number {
  let best = 0;
  let current = 0;
  let previous: number | null = null;

  for (const item of TRAIT_ITEMS) {
    const value = byId.get(item.id);
    if (value === undefined) {
      previous = null;
      current = 0;
      continue;
    }
    current = value === previous ? current + 1 : 1;
    previous = value;
    if (current > best) best = current;
  }
  return best;
}

/**
 * Calcule préférences, traits et qualité. Tolérant : un énoncé sans réponse est
 * simplement ignoré, un identifiant inconnu aussi (une version antérieure du
 * questionnaire ne doit pas faire planter la lecture d'une vieille réponse).
 */
export function computeQuestionnaireScores(answers: RawAnswer[]): QuestionnaireScores {
  const byId = new Map<string, number>();
  for (const a of answers) {
    // Un identifiant inconnu (énoncé retiré depuis) est ignoré, pas compté :
    // sinon `answered` gonflerait et une vieille réponse paraîtrait complète.
    if (!ITEM_IDS.has(a.itemId)) continue;
    if (a.value >= SCALE_MIN && a.value <= SCALE_MAX) byId.set(a.itemId, a.value);
  }

  const preferences = Object.fromEntries(
    PREFERENCE_KEYS.map((key) => {
      const item = PREFERENCE_ITEMS.find((i) => i.dimension === key);
      return [key, (item && byId.get(item.id)) ?? null];
    })
  ) as Record<PreferenceKey, number | null>;

  const traits = {} as Record<TraitKey, number | null>;
  const inconsistentTraits: TraitKey[] = [];

  for (const key of TRAIT_KEYS) {
    const items = TRAIT_ITEMS.filter((i) => i.dimension === key);
    const direct: number[] = [];
    const inverted: number[] = [];

    for (const item of items) {
      const raw = byId.get(item.id);
      if (raw === undefined) continue;
      if (item.reverse) inverted.push(reverseValue(raw));
      else direct.push(raw);
    }

    traits[key] = mean([...direct, ...inverted]);

    // Les deux sous-groupes mesurent la même chose : ils doivent converger.
    const dMean = mean(direct);
    const iMean = mean(inverted);
    if (dMean !== null && iMean !== null && Math.abs(dMean - iMean) > INCONSISTENCY_THRESHOLD) {
      inconsistentTraits.push(key);
    }
  }

  const times = answers
    .map((a) => a.elapsedMs)
    .filter((ms): ms is number => typeof ms === 'number' && ms > 0);
  const medianMs = median(times);
  const run = longestIdenticalRun(byId);

  const flags: string[] = [];
  if (run >= LONG_STRING_THRESHOLD) flags.push(`${run} réponses identiques d'affilée`);
  if (medianMs !== null && medianMs < MIN_MS_PER_ITEM) {
    flags.push(`${Math.round(medianMs / 100) / 10} s par énoncé en médiane`);
  }
  if (inconsistentTraits.length > MAX_INCONSISTENT_TRAITS) {
    flags.push(`${inconsistentTraits.length} traits aux réponses contradictoires`);
  }

  return {
    preferences,
    traits,
    quality: {
      answered: byId.size,
      longestIdenticalRun: run,
      medianMsPerItem: medianMs,
      inconsistentTraits,
      careless: flags.length > 0,
      flags,
    },
  };
}

/** Vrai si tous les énoncés ont une réponse valide — condition pour soumettre. */
export function isComplete(answers: RawAnswer[]): boolean {
  const byId = new Set(
    answers.filter((a) => a.value >= SCALE_MIN && a.value <= SCALE_MAX).map((a) => a.itemId)
  );
  return ALL_ITEMS.every((i) => byId.has(i.id));
}

/** Identifiants d'énoncés encore sans réponse. */
export function missingItemIds(answers: RawAnswer[]): string[] {
  const answered = new Set(
    answers.filter((a) => a.value >= SCALE_MIN && a.value <= SCALE_MAX).map((a) => a.itemId)
  );
  return ALL_ITEMS.filter((i) => !answered.has(i.id)).map((i) => i.id);
}

// ─────────────────────────── Écarts personne ↔ site ──────────────────────────

/** Cotes de contexte d'un mandat. null = non coté, et un site non coté ne
 *  produit jamais d'écart. */
export interface MandateContext {
  conflictFrequency: number | null;
  publicContact: number | null;
  monotony: number | null;
  autonomy: number | null;
  outdoorExposure: number | null;
  physicalDemand: number | null;
}

export interface Friction {
  dimension: PreferenceKey;
  /** Ce que le site exige (1-5). */
  siteRating: number;
  /** Ce que la personne dit tolérer (1-5). */
  tolerance: number;
  /** siteRating − tolerance, toujours > 0. */
  gap: number;
}

/**
 * Points de friction entre les exigences du site et ce que la personne dit
 * tolérer. Uniquement le déficit : un site peu monotone n'est pas un problème
 * pour quelqu'un qui tolère très bien la monotonie.
 *
 * Renvoie une liste vide quand le site n'est pas coté ou la personne n'a pas
 * répondu — l'absence de donnée n'est pas un signal.
 */
export function computeFrictions(
  context: MandateContext,
  preferences: Partial<Record<PreferenceKey, number | null>>
): Friction[] {
  const frictions: Friction[] = [];

  for (const key of PREFERENCE_KEYS) {
    const field = PREFERENCE_TO_MANDATE_FIELD[key] as keyof MandateContext;
    const siteRating = context[field];
    const tolerance = preferences[key];
    if (siteRating == null || tolerance == null) continue;

    const gap = siteRating - tolerance;
    if (gap > 0) frictions.push({ dimension: key, siteRating, tolerance, gap });
  }

  return frictions.sort((a, b) => b.gap - a.gap);
}
