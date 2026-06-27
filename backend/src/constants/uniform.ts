/**
 * Constantes du module Uniformes — reproduisent EXACTEMENT les 2 formulaires
 * papier XGuard (« Prêt d'uniforme » et « Retour d'uniforme »).
 *
 * - SEED_CATALOGUE : morceaux/équipements par division + coûts unitaires.
 * - SIZE_* : barème de grandeurs par défaut (éditable in-app).
 * - UNIFORM_CONSENT_* : textes de consentement affichés à la signature.
 */

export type UniformDivisionKey = 'SECURITE' | 'SIGNALISATION';
export type UniformPieceTypeKey = 'UNIFORME' | 'EQUIPEMENT';

export interface SeedItem {
  name: string;
  type: UniformPieceTypeKey;
  cost: number;
  /** "Taille unique" → une seule variante (size = "Unique"). */
  isOneSize?: boolean;
  /** Barème de grandeurs ; absent = morceau sans taille (équipement) ou one-size. */
  sizes?: string[];
}

// Barèmes de grandeurs par défaut (ajustables dans l'app).
export const SIZE_TOPS = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
export const SIZE_PANTS = ['28', '30', '32', '34', '36', '38', '40', '42', '44'];
export const SIZE_BELT = ['S', 'M', 'L', 'XL'];

export const SEED_CATALOGUE: { division: UniformDivisionKey; items: SeedItem[] }[] = [
  {
    division: 'SECURITE',
    items: [
      // Pièces d'uniforme
      { name: 'Chemise grise (MC)', type: 'UNIFORME', cost: 40, sizes: SIZE_TOPS },
      { name: 'Chemise grise (ML)', type: 'UNIFORME', cost: 40, sizes: SIZE_TOPS },
      { name: 'Chemise blanche (MC)', type: 'UNIFORME', cost: 40, sizes: SIZE_TOPS },
      { name: 'Chemise blanche (ML)', type: 'UNIFORME', cost: 40, sizes: SIZE_TOPS },
      { name: 'Chemise blanche (complet)', type: 'UNIFORME', cost: 45, sizes: SIZE_TOPS },
      { name: 'Cravate', type: 'UNIFORME', cost: 10, isOneSize: true },
      { name: 'Polo noir', type: 'UNIFORME', cost: 35, sizes: SIZE_TOPS },
      { name: 'Pantalon noir (militaire)', type: 'UNIFORME', cost: 65, sizes: SIZE_PANTS },
      { name: 'Pantalon noir (complet)', type: 'UNIFORME', cost: 65, sizes: SIZE_PANTS },
      { name: 'Veston (complet)', type: 'UNIFORME', cost: 125, sizes: SIZE_TOPS },
      { name: 'Ceinture', type: 'UNIFORME', cost: 25, sizes: SIZE_BELT },
      { name: 'Manteau (3 en 1)', type: 'UNIFORME', cost: 250, sizes: SIZE_TOPS },
      // Pièces d'équipement (sans taille)
      { name: 'Lunette de sécurité', type: 'EQUIPEMENT', cost: 10 },
      { name: 'Dossard de sécurité', type: 'EQUIPEMENT', cost: 25 },
      { name: 'Gant de sécurité', type: 'EQUIPEMENT', cost: 25 },
      { name: 'Lampe de poche', type: 'EQUIPEMENT', cost: 15 },
      { name: 'Plaque aimanté – Sécurité (P7)', type: 'EQUIPEMENT', cost: 20 },
      { name: 'Gyrophare', type: 'EQUIPEMENT', cost: 50 },
    ],
  },
  {
    division: 'SIGNALISATION',
    items: [
      { name: 'Chandail haute visibilité (MC)', type: 'UNIFORME', cost: 25, sizes: SIZE_TOPS },
      { name: 'Chandail haute visibilité (ML)', type: 'UNIFORME', cost: 35, sizes: SIZE_TOPS },
      { name: 'Pantalon haute visibilité (Été)', type: 'UNIFORME', cost: 55, sizes: SIZE_PANTS },
      { name: 'Pantalon haute visibilité (Hiver)', type: 'UNIFORME', cost: 95, sizes: SIZE_PANTS },
      { name: 'Pantalon haute visibilité (Imperméable)', type: 'UNIFORME', cost: 55, sizes: SIZE_PANTS },
      { name: 'Manteau haute visibilité (Imperméable)', type: 'UNIFORME', cost: 65, sizes: SIZE_TOPS },
      { name: 'Manteau haute visibilité (Hiver)', type: 'UNIFORME', cost: 250, sizes: SIZE_TOPS },
      { name: 'Casque de sécurité', type: 'UNIFORME', cost: 35, isOneSize: true },
      { name: 'Dossard de sécurité', type: 'UNIFORME', cost: 25, isOneSize: true },
      { name: 'Chapeau de pluie', type: 'UNIFORME', cost: 15, isOneSize: true },
    ],
  },
];

// Textes de consentement — repris VERBATIM des formulaires.
export const UNIFORM_CONSENT_PAYROLL =
  "Par la présente, je consens à ce que le montant équivalent au coût total du prêt soit prélevé " +
  "sur ma dernière paie dans l'éventualité où je ne retournerais pas mes uniformes aux bureaux de " +
  "« Sécurité XGuard Inc. » (9380 boulevard Saint-Laurent, Montréal, H2N 1P3) lors de ma fin d'emploi, " +
  "qu'elle soit volontaire ou involontaire. Je m'engage à retourner l'entièreté de mes uniformes et/ou " +
  "mes équipements dans les 5 jours ouvrables suivant la fin de mon emploi.";

export const UNIFORM_CONSENT_POLICY =
  "À titre d'agent de sécurité pour « Sécurité XGuard Inc. », je consens à porter mon uniforme de façon " +
  "professionnelle en tout temps lorsque je suis dans l'exercice de mes fonctions : chemise et pantalon " +
  "propres et repassés ; chemise et polo à l'intérieur du pantalon ; chemise et polo toujours entièrement " +
  "boutonnés à l'exception du dernier bouton ; aucun t-shirt apparent sous la chemise ; souliers ou bottes " +
  "noirs unis. Je m'engage à respecter le port de l'uniforme selon les particularités de chacun des sites " +
  "sur lesquels je serai affecté et à utiliser UNIQUEMENT l'uniforme fourni et autorisé par mon employeur. " +
  "De plus, je comprends qu'il est de ma responsabilité de m'assurer que j'ai en ma possession l'uniforme " +
  "requis pour effectuer mes quarts de travail, auquel cas, je dois en informer les opérations dans les " +
  "plus brefs délais.";

export const UNIFORM_FIT_ATTESTATION =
  "Je confirme avoir essayé mes uniformes sur place et j'atteste que la taille est adéquate et professionnelle.";

// Durée de validité du lien de signature (jours).
export const SIGN_TOKEN_DAYS = 7;

// ---------------------------------------------------------------------------
// Offboarding — retour des uniformes des employés qui quittent.
// ---------------------------------------------------------------------------
// Délai accordé à un employé pour retourner ses uniformes après sa fin d'emploi
// (jours OUVRABLES). Reproduit la clause du consentement « Prêt d'uniforme »
// (retour sous 5 jours ouvrables suivant la fin d'emploi).
export const UNIFORM_RETURN_DEADLINE_BUSINESS_DAYS = 5;

// Délai de grâce supplémentaire (jours OUVRABLES) après l'échéance de retour
// avant la CLÔTURE AUTOMATIQUE de la remise (pièces marquées NOT_RETURNED, dette
// figée pour prélèvement sur la dernière paie). Déclenché par le job horaire.
export const UNIFORM_AUTOCLOSE_GRACE_BUSINESS_DAYS = 10;
