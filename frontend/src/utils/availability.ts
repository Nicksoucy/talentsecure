/**
 * Disponibilités — traduction entre les cases du formulaire d'entrevue et la
 * charge utile envoyée à l'API.
 *
 * Les 5 cases reprennent celles du formulaire GHL « Renseignements étudiants » :
 * 24/7, jour, soir, nuit, fin de semaine. Côté serveur, les colonnes
 * `available*` sont la source de vérité et la table `availabilities` reste
 * alimentée en miroir le temps d'une release.
 */

/** Cases telles que nommées dans le formulaire d'entrevue (au singulier). */
export interface AvailabilityFormFields {
    available24_7?: boolean;
    availableDay?: boolean;
    availableEvening?: boolean;
    availableNight?: boolean;
    availableWeekend?: boolean;
}

export interface AvailabilityPayload {
    available24_7: boolean;
    availableDays: boolean;
    availableEvenings: boolean;
    availableNights: boolean;
    availableWeekends: boolean;
    /** Miroir relationnel. Toujours un tableau — jamais `undefined` : c'est ce
     *  qui permet au serveur de distinguer « tout décoché » de « on n'en parle
     *  pas ». Envoyer `undefined` était la raison pour laquelle décocher toutes
     *  les cases ne les effaçait jamais. */
    availabilities: Array<{ type: string }>;
}

/**
 * Construit la charge utile des disponibilités.
 * 24/7 implique les 4 quarts (même règle que `normalizeAvailability` côté
 * serveur) : sans ça, un candidat 24/7 ne ressortirait pas d'un filtre « jour ».
 */
export function buildAvailabilityPayload(form: AvailabilityFormFields): AvailabilityPayload {
    const all = form.available24_7 === true;
    const days = all || form.availableDay === true;
    const evenings = all || form.availableEvening === true;
    const nights = all || form.availableNight === true;
    const weekends = all || form.availableWeekend === true;

    const availabilities: Array<{ type: string }> = [];
    if (days) availabilities.push({ type: 'JOUR' });
    if (evenings) availabilities.push({ type: 'SOIR' });
    if (nights) availabilities.push({ type: 'NUIT' });
    if (weekends) availabilities.push({ type: 'FIN_DE_SEMAINE' });

    return {
        available24_7: all,
        availableDays: days,
        availableEvenings: evenings,
        availableNights: nights,
        availableWeekends: weekends,
        availabilities,
    };
}

/** Libellés courts des quarts, pour les puces et les badges. */
export function availabilityLabels(c: {
    available24_7?: boolean;
    availableDays?: boolean;
    availableEvenings?: boolean;
    availableNights?: boolean;
    availableWeekends?: boolean;
}): string[] {
    if (c.available24_7) return ['24/7'];
    const labels: string[] = [];
    if (c.availableDays) labels.push('Jour');
    if (c.availableEvenings) labels.push('Soir');
    if (c.availableNights) labels.push('Nuit');
    if (c.availableWeekends) labels.push('FDS');
    return labels;
}

/**
 * Options du filtre « Disponibilités » des listes.
 *
 * Les valeurs sont les jetons attendus par l'API (`?availability=` côté
 * candidats potentiels, `availability[]` côté recherche avancée) ; les libellés
 * sont ceux qu'on lit à l'écran. Le filtre exige TOUS les quarts cochés, et un
 * profil 24/7 ressort de chacun d'eux (24/7 implique les 4 quarts).
 */
export const AVAILABILITY_FILTER_OPTIONS = [
    { value: '24/7', label: '24/7' },
    { value: 'days', label: 'Jour' },
    { value: 'evenings', label: 'Soir' },
    { value: 'nights', label: 'Nuit' },
    { value: 'weekends', label: 'Fin de semaine' },
] as const;

/** Libellé lisible d'un jeton de filtre (repli : le jeton lui-même). */
export function availabilityFilterLabel(value: string): string {
    return AVAILABILITY_FILTER_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
