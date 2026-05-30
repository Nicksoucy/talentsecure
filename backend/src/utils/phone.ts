/**
 * Helpers de normalisation de numéros de téléphone.
 *
 * Les numéros arrivent dans des formats variés (+14385551234, (438) 555-1234,
 * 438-555-1234, etc.). Pour comparer/dédupliquer on se base sur les 10 derniers
 * chiffres (numéro nord-américain sans l'indicatif pays).
 */

/** Retourne les 10 derniers chiffres d'un numéro (chaîne vide si aucun). */
export function lastTenDigits(phone?: string | null): string {
  return (phone || '').replace(/\D/g, '').slice(-10);
}
