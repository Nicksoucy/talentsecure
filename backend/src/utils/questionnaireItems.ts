/**
 * Banque d'énoncés du « Questionnaire de préférences de travail et d'affectation ».
 *
 * ── Pourquoi ces énoncés-là ───────────────────────────────────────────────────
 * Les 4 traits mesurés sont ceux que le métier récompense réellement selon le
 * profil O*NET du code 33-9032 « Security Guards » (licence CC BY 4.0) :
 * Fiabilité 98, Intégrité 98, Maîtrise de soi 79, Tolérance au stress 74 — alors
 * que Coopération (42), Orientation sociale (30) et Leadership (20) s'effondrent.
 * Un questionnaire qui mesurerait l'entregent mesurerait la mauvaise chose.
 *
 * Les énoncés s'inspirent des construits de l'IPIP (ipip.ori.org), placé dans le
 * domaine public avec permission explicite d'usage commercial (Goldberg et al.,
 * 2006). Ils sont RÉÉCRITS et contextualisés au travail de terrain plutôt que
 * traduits : les traductions françaises hébergées par l'IPIP ne sont pas
 * validées (l'IPIP l'indique lui-même) et leur registre est trop scolaire pour
 * une main-d'œuvre multiculturelle. Viser un niveau de lecture de 5e-6e année.
 *
 * ── Contraintes légales gravées dans le contenu ──────────────────────────────
 * Art. 18.1 de la Charte (RLRQ c. C-12) : interdit de requérir des
 * renseignements sur un motif de l'art. 10 lors de l'embauche. Donc :
 *  - AUCUN énoncé clinique — pas de symptôme, pas d'historique, pas de fréquence
 *    de détresse. La dépression et l'épuisement professionnel sont reconnus comme
 *    « handicap » : un énoncé qui cherche à les établir viole 18.1.
 *  - AUCUN énoncé sur le vote, la religion, l'origine, l'état civil, l'âge ou la
 *    situation familiale (c'est pourquoi la facette « Libéralisme » de l'IPIP-NEO
 *    est exclue : ses items portent sur le vote et la religion).
 *  - Tout est comportemental et situé AU TRAVAIL.
 *
 * ── Pourquoi 5 énoncés par trait ─────────────────────────────────────────────
 * En dessous de 4, la fidélité s'effondre (le Mini-IPIP à 4 items tombe à
 * .62-.71) et la détection des réponses bâclées devient impossible. Chaque trait
 * porte 2 énoncés inversés : sans eux, une personne qui coche « 5 » partout est
 * indétectable.
 */

/** Version de la banque. Toute modification d'énoncé DOIT l'incrémenter : les
 *  réponses passées ne sont plus comparables autrement. */
export const QUESTIONNAIRE_VERSION = 'v1';

/** Échelle unique, entièrement étiquetée (une étiquette par point, jamais des
 *  nombres nus : « 3 » ne veut rien dire de la même façon pour deux personnes). */
export const SCALE_LABELS = [
  'Pas du tout',
  'Un peu',
  'Moyennement',
  'Beaucoup',
  'Tout à fait',
] as const;

export const SCALE_MIN = 1;
export const SCALE_MAX = 5;

/** Les 6 dimensions de préférence répondent une à une aux cotes de contexte du
 *  mandat (`conflictFrequency`, `publicContact`, …), pour que la comparaison
 *  site ↔ personne se fasse sur la même échelle. */
export type PreferenceKey =
  | 'conflictTolerance'
  | 'publicContactPref'
  | 'monotonyTolerance'
  | 'autonomyPref'
  | 'outdoorTolerance'
  | 'physicalTolerance';

export type TraitKey = 'dependability' | 'integrity' | 'selfControl' | 'stressTolerance';

export interface QuestionnaireItem {
  id: string;
  text: string;
  /** Préférence déclarée (un fait) ou énoncé de trait (une tendance). */
  block: 'preference' | 'trait';
  dimension: PreferenceKey | TraitKey;
  /** Inversé : un score élevé signifie MOINS de la dimension. */
  reverse?: boolean;
}

/**
 * Bloc préférences — le plus rentable des deux.
 *
 * Ce sont des faits déclarés, pas des traits : ils ne demandent aucune
 * validation psychométrique, ils sont directement comparables au profil du site,
 * et un candidat n'a aucun intérêt à mentir puisque la réponse détermine où on
 * l'enverra travailler.
 */
export const PREFERENCE_ITEMS: QuestionnaireItem[] = [
  {
    id: 'pref_conflit',
    block: 'preference',
    dimension: 'conflictTolerance',
    text: "Devoir gérer une personne fâchée ou agressive, ça me convient.",
  },
  {
    id: 'pref_public',
    block: 'preference',
    dimension: 'publicContactPref',
    text: 'Parler à des gens toute la journée, ça me convient.',
  },
  {
    id: 'pref_monotonie',
    block: 'preference',
    dimension: 'monotonyTolerance',
    text: "Faire la même chose pendant tout un quart, sans imprévu, ça me convient.",
  },
  {
    id: 'pref_seul',
    block: 'preference',
    dimension: 'autonomyPref',
    text: 'Travailler seul, sans collègue sur place, ça me convient.',
  },
  {
    id: 'pref_exterieur',
    block: 'preference',
    dimension: 'outdoorTolerance',
    text: 'Travailler dehors, même par mauvais temps, ça me convient.',
  },
  {
    id: 'pref_physique',
    block: 'preference',
    dimension: 'physicalTolerance',
    text: 'Rester debout et marcher pendant tout le quart, ça me convient.',
  },
];

/** Bloc traits — 4 dimensions × 5 énoncés, dont 2 inversés chacune. */
export const TRAIT_ITEMS: QuestionnaireItem[] = [
  // ── Fiabilité ──────────────────────────────────────────────────────────────
  { id: 'fia_1', block: 'trait', dimension: 'dependability', text: "J'arrive à l'heure, même quand ma journée commence mal." },
  { id: 'fia_2', block: 'trait', dimension: 'dependability', text: 'Quand je dis que je vais faire quelque chose, je le fais.' },
  { id: 'fia_3', block: 'trait', dimension: 'dependability', reverse: true, text: "Il m'arrive de remettre à plus tard une tâche que je devrais faire tout de suite." },
  { id: 'fia_4', block: 'trait', dimension: 'dependability', text: 'Je suis les consignes même quand personne ne me surveille.' },
  { id: 'fia_5', block: 'trait', dimension: 'dependability', reverse: true, text: "Quand une tâche est plate, j'ai tendance à la faire vite et mal." },

  // ── Intégrité ──────────────────────────────────────────────────────────────
  { id: 'int_1', block: 'trait', dimension: 'integrity', text: "Je signale un problème même si ça me met dans l'embarras." },
  { id: 'int_2', block: 'trait', dimension: 'integrity', reverse: true, text: "Il y a des règlements qu'on peut contourner quand personne ne le voit." },
  { id: 'int_3', block: 'trait', dimension: 'integrity', text: 'Dans un rapport, je dis ce qui est arrivé même si ça ne fait pas mon affaire.' },
  { id: 'int_4', block: 'trait', dimension: 'integrity', reverse: true, text: "Prendre une pause plus longue que permis, ce n'est pas si grave." },
  { id: 'int_5', block: 'trait', dimension: 'integrity', text: "Je rapporte ce que j'ai vu exactement comme ça s'est passé." },

  // ── Maîtrise de soi ────────────────────────────────────────────────────────
  { id: 'mai_1', block: 'trait', dimension: 'selfControl', text: "Je garde mon calme quand quelqu'un m'insulte." },
  { id: 'mai_2', block: 'trait', dimension: 'selfControl', reverse: true, text: "Quand on me manque de respect, j'ai de la misère à me retenir de répondre." },
  { id: 'mai_3', block: 'trait', dimension: 'selfControl', text: "Je prends le temps de réfléchir avant d'agir dans une situation tendue." },
  { id: 'mai_4', block: 'trait', dimension: 'selfControl', reverse: true, text: "Je hausse le ton quand ça ne va pas comme je veux." },
  { id: 'mai_5', block: 'trait', dimension: 'selfControl', text: 'Je reste poli avec une personne désagréable.' },

  // ── Tolérance au stress ────────────────────────────────────────────────────
  // Formulé sur la PERFORMANCE en situation, jamais sur un ressenti durable :
  // « je m'inquiète longtemps après un incident » glisserait vers le clinique.
  { id: 'str_1', block: 'trait', dimension: 'stressTolerance', text: 'Je reste efficace quand plusieurs choses arrivent en même temps.' },
  { id: 'str_2', block: 'trait', dimension: 'stressTolerance', reverse: true, text: "Un imprévu me mêle pour le reste de mon quart." },
  { id: 'str_3', block: 'trait', dimension: 'stressTolerance', text: 'Je travaille bien quand il y a de la pression.' },
  { id: 'str_4', block: 'trait', dimension: 'stressTolerance', text: "Quand un imprévu bouscule mon quart, je m'ajuste vite." },
  { id: 'str_5', block: 'trait', dimension: 'stressTolerance', reverse: true, text: "Quand tout arrive en même temps, j'ai de la misère à décider quoi faire en premier." },
];

export const ALL_ITEMS: QuestionnaireItem[] = [...PREFERENCE_ITEMS, ...TRAIT_ITEMS];

export const ITEM_IDS = new Set(ALL_ITEMS.map((i) => i.id));

export const TRAIT_KEYS: TraitKey[] = ['dependability', 'integrity', 'selfControl', 'stressTolerance'];

export const PREFERENCE_KEYS: PreferenceKey[] = [
  'conflictTolerance',
  'publicContactPref',
  'monotonyTolerance',
  'autonomyPref',
  'outdoorTolerance',
  'physicalTolerance',
];

/**
 * Correspondance préférence du candidat ↔ cote de contexte du mandat.
 * C'est ce qui permet de comparer les deux côtés sur la même échelle 1-5.
 */
export const PREFERENCE_TO_MANDATE_FIELD: Record<PreferenceKey, string> = {
  conflictTolerance: 'conflictFrequency',
  publicContactPref: 'publicContact',
  monotonyTolerance: 'monotony',
  autonomyPref: 'autonomy',
  outdoorTolerance: 'outdoorExposure',
  physicalTolerance: 'physicalDemand',
};

/** Libellés lisibles, partagés par l'écran candidat et l'écran répartition. */
export const DIMENSION_LABELS: Record<PreferenceKey | TraitKey, string> = {
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
