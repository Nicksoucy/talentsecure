/**
 * Questionnaire de préférences de travail et d'affectation.
 *
 * Rappel de cadrage, valable pour tout écran qui consomme ces types : le
 * résultat sert à PROPOSER des mandats. Il ne classe pas les gens du meilleur au
 * pire, et aucune interface ne doit le présenter comme une note.
 */

export type QuestionnaireBlock = 'preference' | 'trait';

export interface QuestionnaireItem {
  id: string;
  text: string;
  block: QuestionnaireBlock;
  dimension: string;
}

export interface QuestionnaireSession {
  firstName: string;
  version: string;
  scaleLabels: string[];
  consentGiven: boolean;
  items: QuestionnaireItem[];
  /** Réponses déjà enregistrées (reprise après une interruption). */
  answers: Array<{ itemId: string; value: number }>;
}

export interface AnswerInput {
  itemId: string;
  value: number;
  elapsedMs?: number;
}

/** Conclusions visibles par le personnel. Jamais les réponses énoncé par énoncé. */
export interface QuestionnaireSummary {
  id: string;
  personType: string;
  personId: string;
  version: string;
  status: string;
  completedAt: string | null;
  prefConflictTolerance: number | null;
  prefPublicContact: number | null;
  prefMonotonyTolerance: number | null;
  prefAutonomy: number | null;
  prefOutdoorTolerance: number | null;
  prefPhysicalTolerance: number | null;
  traitDependability: number | null;
  traitIntegrity: number | null;
  traitSelfControl: number | null;
  traitStressTolerance: number | null;
  qualityFlags: string[];
  careless: boolean;
  source: string;
}

export interface QuestionnaireInvitation {
  id: string;
  url: string;
  expiresAt: string;
  status: string;
}

/** Écart entre ce que le site exige et ce que la personne dit tolérer. */
export interface Friction {
  dimension: string;
  siteRating: number;
  tolerance: number;
  gap: number;
}

/** Libellés partagés — mêmes clés que `questionnaireItems.ts` côté serveur. */
export const DIMENSION_LABELS: Record<string, string> = {
  conflictTolerance: 'Situations conflictuelles',
  publicContactPref: 'Contact avec le public',
  monotonyTolerance: 'Tâches répétitives',
  autonomyPref: 'Travail seul',
  outdoorTolerance: 'Travail à l’extérieur',
  physicalTolerance: 'Exigence physique',
  dependability: 'Fiabilité',
  integrity: 'Intégrité',
  selfControl: 'Maîtrise de soi',
  stressTolerance: 'Tolérance au stress',
};

export const TRAIT_FIELDS: Array<{ key: keyof QuestionnaireSummary; label: string }> = [
  { key: 'traitDependability', label: 'Fiabilité' },
  { key: 'traitIntegrity', label: 'Intégrité' },
  { key: 'traitSelfControl', label: 'Maîtrise de soi' },
  { key: 'traitStressTolerance', label: 'Tolérance au stress' },
];

export const PREFERENCE_FIELDS: Array<{ key: keyof QuestionnaireSummary; label: string }> = [
  { key: 'prefConflictTolerance', label: 'Situations conflictuelles' },
  { key: 'prefPublicContact', label: 'Contact avec le public' },
  { key: 'prefMonotonyTolerance', label: 'Tâches répétitives' },
  { key: 'prefAutonomy', label: 'Travail seul' },
  { key: 'prefOutdoorTolerance', label: 'Travail à l’extérieur' },
  { key: 'prefPhysicalTolerance', label: 'Exigence physique' },
];
