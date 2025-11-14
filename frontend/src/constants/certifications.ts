/**
 * Liste prédéfinie des certifications courantes dans le domaine de la sécurité
 */
export const PREDEFINED_CERTIFICATIONS = [
  'ASP Construction',
  'Premiers Soins',
  'RCR',
  'SIMDUT',
  'Travail en hauteur',
  'Espace clos',
  'Chariot élévateur',
  'Service à la clientèle',
  'Usage de la force',
  'Gestion de crise',
] as const;

export type CertificationName = typeof PREDEFINED_CERTIFICATIONS[number];
