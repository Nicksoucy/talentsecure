/**
 * Couleurs des couches de carte — un seul endroit à modifier.
 *
 * La palette de base est déjà occupée par les personnes : bleu #2196f3 (secteur
 * postal), vert #2e7d32 (adresse exacte), orange #fb8c00 (centre-ville approx.)
 * et rouge #e53935 (point de rayon déposé). Toute nouvelle couche doit rester
 * franchement distincte de ces quatre-là.
 */

/** Couche MANDATS (sites XGuard) — rose. */
export const SITE_COLOR = '#e91e63';

/**
 * Couche CONTRAT (leads d'un contrat client, ex. PSB) — violet par défaut.
 *
 * Violet plutôt que jaune : le jaune se confond avec les pastilles orange
 * « centre-ville approximatif ». Cette constante est la valeur par défaut pour
 * tout le monde ; chaque utilisateur peut la remplacer via le sélecteur de la
 * carte (choix mémorisé dans son navigateur).
 */
export const CONTRACT_COLOR = '#8e24aa';

/** Choix offerts par le sélecteur de couleur de la couche contrat. */
export const CONTRACT_PALETTE: { name: string; value: string }[] = [
  { name: 'Violet', value: '#8e24aa' },
  { name: 'Jaune', value: '#f9a825' },
  { name: 'Cyan', value: '#00acc1' },
  { name: 'Lime', value: '#7cb342' },
  { name: 'Brun', value: '#6d4c41' },
];

/** Clé localStorage du choix de couleur de la couche contrat. */
export const CONTRACT_STORAGE_KEY = 'ts.map.contractColor';

/**
 * Couleur de la couche contrat retenue par cet utilisateur. Tolère un
 * localStorage indisponible (jsdom, navigation privée) et une valeur corrompue.
 */
export function readContractColor(): string {
  try {
    const saved = window.localStorage.getItem(CONTRACT_STORAGE_KEY);
    if (saved && CONTRACT_PALETTE.some((c) => c.value === saved)) return saved;
  } catch {
    /* localStorage indisponible — on retombe sur la couleur par défaut. */
  }
  return CONTRACT_COLOR;
}

/** Mémorise le choix de couleur. Silencieux si localStorage est indisponible. */
export function saveContractColor(value: string): void {
  try {
    window.localStorage.setItem(CONTRACT_STORAGE_KEY, value);
  } catch {
    /* Sans persistance, le choix reste valable pour la session en cours. */
  }
}
