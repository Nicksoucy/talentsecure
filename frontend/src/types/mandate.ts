/**
 * Mandats (sites XGuard) et jumelage.
 *
 * L'identité et l'adresse viennent de l'import Agendrix ; tout le reste est le
 * « profil », saisi par la répartition. Les cotes de contexte sont `number | null`
 * et non `number` : `null` veut dire « pas encore évalué », ce qui n'est pas la
 * même chose que 1 (faible).
 */
import type { Friction } from './questionnaire';

export const SITE_TYPES = [
  'STATIQUE',
  'MOBILE',
  'CHANTIER',
  'EVENEMENTIEL',
  'RESIDENTIEL',
  'INDUSTRIEL',
  'INSTITUTIONNEL',
] as const;

export type SiteType = (typeof SITE_TYPES)[number];

export const SITE_TYPE_LABELS: Record<SiteType, string> = {
  STATIQUE: 'Poste statique',
  MOBILE: 'Patrouille mobile',
  CHANTIER: 'Chantier',
  EVENEMENTIEL: 'Événementiel',
  RESIDENTIEL: 'Résidentiel',
  INDUSTRIEL: 'Industriel',
  INSTITUTIONNEL: 'Institutionnel',
};

/**
 * Libellés des cotes de contexte.
 *
 * Le vocabulaire suit les « Work Context » d'O*NET pour le code 33-9032
 * (agents de sécurité), afin que le profil d'un site soit rattachable à une
 * source publique plutôt qu'à une impression personnelle.
 */
export interface ContextDimension {
  key: 'conflictFrequency' | 'publicContact' | 'monotony' | 'autonomy' | 'outdoorExposure' | 'physicalDemand';
  label: string;
  /** Ce que veut dire 1, puis ce que veut dire 5. */
  low: string;
  high: string;
}

export const CONTEXT_DIMENSIONS: ContextDimension[] = [
  { key: 'conflictFrequency', label: 'Situations conflictuelles', low: 'Jamais', high: 'Quotidiennes' },
  { key: 'publicContact', label: 'Contact avec le public', low: 'Aucun', high: 'Constant' },
  { key: 'monotony', label: 'Répétitivité des tâches', low: 'Très variée', high: 'Très répétitive' },
  { key: 'autonomy', label: 'Travail seul', low: 'Toujours en équipe', high: 'Toujours seul' },
  { key: 'outdoorExposure', label: 'Exposition aux intempéries', low: 'Intérieur', high: 'Extérieur' },
  { key: 'physicalDemand', label: 'Exigence physique', low: 'Assis', high: 'Rondes constantes' },
];

export interface Mandate {
  id: string;
  externalId: string;
  name: string;
  address: string | null;
  city: string | null;
  province: string;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  geocodeSource: string | null;

  requiresBSP: boolean;
  requiresDriverLicense: boolean;
  requiresVehicle: boolean;
  requiredLanguages: string[];

  shiftDays: boolean;
  shiftEvenings: boolean;
  shiftNights: boolean;
  shiftWeekends: boolean;

  siteType: SiteType | null;
  conflictFrequency: number | null;
  publicContact: number | null;
  monotony: number | null;
  autonomy: number | null;
  outdoorExposure: number | null;
  physicalDemand: number | null;

  clientName: string | null;
  headcount: number | null;
  notes: string | null;
  isActive: boolean;
  /** null = profil jamais rempli. */
  profileUpdatedAt: string | null;
  createdAt: string;
}

/** Corps du PATCH : tout est optionnel, un champ absent n'est pas modifié. */
export type MandateProfileInput = Partial<
  Pick<
    Mandate,
    | 'requiresBSP' | 'requiresDriverLicense' | 'requiresVehicle' | 'requiredLanguages'
    | 'shiftDays' | 'shiftEvenings' | 'shiftNights' | 'shiftWeekends'
    | 'siteType' | 'conflictFrequency' | 'publicContact' | 'monotony'
    | 'autonomy' | 'outdoorExposure' | 'physicalDemand'
    | 'clientName' | 'headcount' | 'notes' | 'isActive'
  >
>;

/** Un candidat évalué pour un mandat. Pas de score : des faits et des blocages. */
export interface MandateCandidate {
  /** Écarts site ↔ préférences déclarées. Vides si aucun questionnaire. */
  frictions: Friction[];
  hasQuestionnaire: boolean;
  candidateId: string;
  eligible: boolean;
  blockers: string[];
  reasons: string[];
  distanceKm: number | null;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  city: string;
  globalRating: number | null;
  status: string;
}

export interface MandateCandidatesMeta {
  evaluated: number;
  eligible: number;
  returned: number;
  /** Motif d'exclusion → nombre de candidats concernés. */
  excludedBy: Record<string, number>;
}
