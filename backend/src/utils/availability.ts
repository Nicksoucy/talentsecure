/**
 * Disponibilités d'un candidat / prospect — source de vérité unique.
 *
 * Les 5 quarts reprennent exactement les cases du formulaire GHL
 * « Renseignements étudiants » : 24/7, jour, soir, nuit, fin de semaine.
 *
 * Historique : deux représentations coexistaient et ne se parlaient pas. Les
 * colonnes booléennes (`available24_7`…) étaient LUES par l'aperçu, les badges,
 * la recherche avancée et le portail client, mais n'étaient JAMAIS écrites ; la
 * table `availabilities` était écrite par le formulaire d'entrevue mais jamais
 * relue. Résultat : « Non spécifié » sur toutes les fiches et 0 résultat sur
 * tous les filtres. Les colonnes sont désormais la vérité ; la relation reste
 * alimentée le temps d'une release (filet de retour arrière).
 */

/** Type de quart tel que stocké dans la table `availabilities`. */
export type AvailabilityRowType = 'JOUR' | 'SOIR' | 'NUIT' | 'FIN_DE_SEMAINE';

export interface AvailabilityFlags {
  available24_7: boolean;
  availableDays: boolean;
  availableEvenings: boolean;
  availableNights: boolean;
  availableWeekends: boolean;
}

/** Entrée tolérante : champs absents, nuls ou non booléens acceptés. */
export type AvailabilityInput = Partial<Record<keyof AvailabilityFlags, unknown>>;

const EMPTY: AvailabilityFlags = {
  available24_7: false,
  availableDays: false,
  availableEvenings: false,
  availableNights: false,
  availableWeekends: false,
};

/**
 * Normalise les 5 drapeaux.
 *
 * Règle centrale : **24/7 implique les 4 quarts**. Sans ça, un candidat marqué
 * 24/7 ne ressortirait pas d'une recherche « disponible le jour », puisque les
 * filtres testent chaque colonne indépendamment
 * (`candidate.service.ts` → advancedSearch, `talent-marketplace.controller.ts`).
 *
 * Appelée par la création et la mise à jour d'un candidat, la conversion d'un
 * prospect et l'ingestion GHL — tout chemin d'écriture passe par ici.
 */
export function normalizeAvailability(input: AvailabilityInput | null | undefined): AvailabilityFlags {
  if (!input) return { ...EMPTY };

  const flag = (v: unknown): boolean => v === true;
  const all = flag(input.available24_7);

  return {
    available24_7: all,
    availableDays: all || flag(input.availableDays),
    availableEvenings: all || flag(input.availableEvenings),
    availableNights: all || flag(input.availableNights),
    availableWeekends: all || flag(input.availableWeekends),
  };
}

/**
 * Vrai si l'appelant a effectivement fourni des disponibilités — permet de
 * distinguer « le client ne parle pas de disponibilités » (on ne touche à rien)
 * de « le client a tout décoché » (on remet tout à false).
 */
export function hasAvailabilityInput(body: AvailabilityInput | null | undefined): boolean {
  if (!body) return false;
  return (Object.keys(EMPTY) as (keyof AvailabilityFlags)[]).some((k) => body[k] !== undefined);
}

/**
 * Lignes de la table `availabilities` correspondant aux drapeaux (double
 * écriture transitoire). « 24/7 » n'a pas de valeur d'enum : il se traduit par
 * les 4 quarts, ce que `normalizeAvailability` a déjà fait.
 */
export function availabilityRowsFrom(
  flags: AvailabilityFlags
): Array<{ type: AvailabilityRowType; isAvailable: boolean }> {
  const rows: Array<{ type: AvailabilityRowType; isAvailable: boolean }> = [];
  if (flags.availableDays) rows.push({ type: 'JOUR', isAvailable: true });
  if (flags.availableEvenings) rows.push({ type: 'SOIR', isAvailable: true });
  if (flags.availableNights) rows.push({ type: 'NUIT', isAvailable: true });
  if (flags.availableWeekends) rows.push({ type: 'FIN_DE_SEMAINE', isAvailable: true });
  return rows;
}

// ─────────────────────────── Ingestion GoHighLevel ───────────────────────────

/**
 * Décode la réponse « Disponibilités » du formulaire GHL.
 *
 * Volontairement pilotée par la VALEUR et non par l'identifiant du champ :
 * survey-sync.service.ts documente que « les IDs de champs du survey ne sont
 * PAS constants entre soumissions (le survey a été édité) ». Un câblage par id
 * seul serait donc à refaire au prochain coup d'éditeur dans GHL.
 *
 * Formes acceptées (GHL en renvoie une ou l'autre selon le type de champ) :
 *   ['jour','soir'] · 'jour, soir' · 'Fin de semaine' · { '0': 'jour' }
 *   · { jour: true, soir: false } · { name: 'jour' }
 *
 * Retourne `null` si RIEN n'est reconnu — l'appelant n'écrit alors rien
 * (dégradation silencieuse : un formulaire modifié ne doit jamais dégrader une
 * fiche déjà correcte).
 */
export function parseGhlAvailability(raw: unknown): AvailabilityFlags | null {
  const tokens = collectTokens(raw);
  if (tokens.length === 0) return null;

  const flags = { ...EMPTY };
  let matched = false;

  for (const token of tokens) {
    const t = deburr(token);
    if (!t) continue;

    // 24/7 testé en premier : « 24h sur 24, 7 jours » ne doit pas aussi
    // déclencher « jour ».
    if (/24\s*[/x·-]?\s*7/.test(t) || /24\s*h?\s*sur\s*24/.test(t) || /\b247\b/.test(t)) {
      flags.available24_7 = true;
      matched = true;
      continue;
    }
    if (/fin\s*de\s*semaine|week\s*-?\s*end|\bfds\b/.test(t)) {
      flags.availableWeekends = true;
      matched = true;
      continue;
    }
    // « toujours » ne doit pas compter comme « jour » → limite de mot.
    if (/\bjour(nee|nees|s)?\b/.test(t)) {
      flags.availableDays = true;
      matched = true;
      continue;
    }
    if (/\bsoir(ee|ees|s)?\b/.test(t)) {
      flags.availableEvenings = true;
      matched = true;
      continue;
    }
    if (/\bnuits?\b/.test(t)) {
      flags.availableNights = true;
      matched = true;
      continue;
    }
  }

  return matched ? normalizeAvailability(flags) : null;
}

/** Minuscule, sans accents, ponctuation ramenée à des espaces. */
function deburr(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, ' ')
    .trim();
}

/** Aplatit n'importe quelle forme GHL en une liste de jetons textuels. */
function collectTokens(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw.flatMap(collectTokens);

  if (typeof raw === 'string') {
    return raw.split(/[,;|\n]+/).map((s) => s.trim()).filter(Boolean);
  }

  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    // Enveloppe { name } déjà connue de extractAnswers (survey-sync).
    if (typeof o.name === 'string') return collectTokens(o.name);

    const values = Object.values(o);
    // Objet de cases cochées { jour: true, soir: false } → on garde les clés vraies.
    if (values.length > 0 && values.every((v) => typeof v === 'boolean')) {
      return Object.keys(o).filter((k) => o[k] === true);
    }
    return values.flatMap(collectTokens);
  }

  return [];
}

/**
 * Un jeton est-il EXACTEMENT un libellé de disponibilité ?
 *
 * Volontairement ancré (`^…$`), contrairement au parseur qui, lui, cherche des
 * motifs à l'intérieur du texte. Une fois qu'on sait que le champ EST celui des
 * disponibilités, on veut de la tolérance ; pour DÉCIDER si c'en est un, il faut
 * au contraire de la sévérité — sinon une réponse libre du genre « je préfère de
 * jour mais je suis flexible » serait prise pour une case cochée.
 */
function isAvailabilityToken(token: string): boolean {
  const t = deburr(token);
  return (
    /^(24\s*\/?\s*7|24\s*h?\s*sur\s*24|247)$/.test(t) ||
    /^(de\s*)?jour(nee|nees|s)?$/.test(t) ||
    /^(de\s*)?soir(ee|ees|s)?$/.test(t) ||
    /^(de\s*)?nuits?$/.test(t) ||
    /^(fin\s*de\s*semaine|week\s*-?\s*end|fds)$/.test(t)
  );
}

/**
 * Repère la réponse « Disponibilités » parmi les réponses d'un formulaire, sans
 * connaître son identifiant GHL.
 *  1. par LIBELLÉ : une clé qui contient « disponib » ;
 *  2. par VALEUR : la première réponse dont TOUS les jetons sont exactement des
 *     libellés de disponibilité (voir `isAvailabilityToken`).
 */
export function findGhlAvailabilityAnswer(
  answers: Record<string, unknown> | null | undefined
): unknown | null {
  if (!answers) return null;

  for (const [key, value] of Object.entries(answers)) {
    if (deburr(key).includes('disponib')) return value;
  }

  for (const value of Object.values(answers)) {
    const tokens = collectTokens(value);
    if (tokens.length === 0) continue;
    if (tokens.every(isAvailabilityToken)) return value;
  }

  return null;
}

/**
 * Reconstruit les drapeaux depuis les lignes de `availabilities` — utilisé par
 * le backfill pour rattraper l'historique (import 2026 + saisies du formulaire
 * d'entrevue faites avant ce correctif).
 */
export function flagsFromAvailabilityRows(
  rows: Array<{ type: string; isAvailable?: boolean }> | null | undefined
): AvailabilityFlags {
  if (!rows || rows.length === 0) return { ...EMPTY };

  const has = (type: string) => rows.some((r) => r.type === type && r.isAvailable !== false);
  return normalizeAvailability({
    // Les 4 quarts cochés = 24/7 (c'est ce que l'ancien import « les 3 » + FDS
    // voulait dire) ; sinon on garde le détail.
    available24_7: has('JOUR') && has('SOIR') && has('NUIT') && has('FIN_DE_SEMAINE'),
    availableDays: has('JOUR'),
    availableEvenings: has('SOIR'),
    availableNights: has('NUIT'),
    availableWeekends: has('FIN_DE_SEMAINE'),
  });
}
