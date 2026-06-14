interface ExperienceLike {
  durationMonths?: number | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}

/**
 * Total de mois d'expérience d'un ensemble d'expériences — source de vérité
 * unique pour le champ dénormalisé `Candidate.totalExperienceMonths`.
 *
 * Pour chaque expérience : utilise `durationMonths` s'il est renseigné, sinon
 * calcule la durée depuis `startDate` → `endDate` (endDate absente = poste en
 * cours → jusqu'à aujourd'hui). Les expériences sans date ni durée comptent 0.
 *
 * Le backfill SQL n'existe pas : c'est ce calcul (via le script
 * `backfill:experience-months`) qui remplit la colonne, et les chemins
 * d'écriture de candidats (create / update / conversion prospect) qui la
 * maintiennent à jour.
 */
export function computeExperienceMonths(experiences: ExperienceLike[] | null | undefined): number {
  if (!experiences || experiences.length === 0) return 0;
  let total = 0;
  for (const e of experiences) {
    if (e.durationMonths != null && e.durationMonths > 0) {
      total += e.durationMonths;
      continue;
    }
    if (e.startDate) {
      const start = new Date(e.startDate);
      const end = e.endDate ? new Date(e.endDate) : new Date();
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
        const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        total += Math.max(0, months);
      }
    }
  }
  return total;
}
