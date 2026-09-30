/**
 * Dates « heure de Montréal » sans dépendance : les échéances de retour
 * d'uniformes sont des JOURS (ex. « au plus tard le 10 octobre ») et doivent
 * expirer à la fin de cette journée à Montréal, peu importe le fuseau du
 * conteneur (UTC sur Cloud Run).
 */
const TZ = 'America/Toronto'; // même fuseau que Montréal, nom IANA canonique

function partsIn(date: Date): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Jour civil à Montréal, format YYYY-MM-DD. */
export function montrealYmd(date: Date = new Date()): string {
  const { y, m, d } = partsIn(date);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Instant UTC de 23:59:59.999 à Montréal pour le jour YYYY-MM-DD. */
export function endOfDayMontreal(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  // Décalage de Montréal à cet instant (−4 h ou −5 h selon l'heure avancée).
  const p = partsIn(new Date(guess));
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s, 999);
  return new Date(guess + (guess - asUtc));
}

/** Ajoute des jours de calendrier à un jour YYYY-MM-DD. */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** « 10 octobre 2026 » (jour civil à Montréal). */
export function formatLongFr(date: Date): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}
