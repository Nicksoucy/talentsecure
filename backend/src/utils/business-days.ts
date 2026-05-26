/**
 * Utilitaires pour le calcul de jours/heures ouvrables (sans samedi ni dimanche).
 *
 * V1 : pas de calendrier des jours fériés québécois — les fériés tombent comme
 * des jours ouvrables. À ajouter en V2 si nécessaire.
 */

/** Renvoie true si la date est un jour ouvrable (lundi..vendredi). */
export function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

/** Ajoute n jours ouvrables à une date. n peut être négatif. */
export function addBusinessDays(date: Date, n: number): Date {
  const result = new Date(date.getTime());
  if (n === 0) return result;
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    result.setDate(result.getDate() + step);
    if (isBusinessDay(result)) remaining--;
  }
  return result;
}

/** Soustrait n heures ouvrables (en gardant heure/minute, skip weekends). */
export function subtractBusinessHours(date: Date, hours: number): Date {
  // Approximation simple : on convertit en jours ouvrables (24h = 1 jour).
  // Pour des cas plus précis (heures de bureau 9h-17h), V2.
  const days = Math.ceil(hours / 24);
  return addBusinessDays(date, -days);
}

/** Différence en jours ouvrables entre 2 dates (a - b). Positif si a > b. */
export function businessDaysBetween(a: Date, b: Date): number {
  if (a.getTime() === b.getTime()) return 0;
  const forward = a.getTime() > b.getTime();
  const [start, end] = forward ? [b, a] : [a, b];
  const cur = new Date(start.getTime());
  let count = 0;
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    if (isBusinessDay(cur)) count++;
  }
  return forward ? count : -count;
}
