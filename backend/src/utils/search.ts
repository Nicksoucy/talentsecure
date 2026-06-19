/**
 * Moteur de recherche de personnes — normalisation + tokenisation + résolution
 * d'ids via la colonne générée `searchText` (insensible aux accents/casse,
 * normalisée pour les téléphones) présente sur `candidates`, `employees` et
 * `prospect_candidates` (cf. migration 20260620000000_add_search_text).
 *
 * Principe :
 *  - On normalise la requête de la MÊME façon que la colonne SQL
 *    (`immutable_unaccent(lower(...))`) : NFD + suppression des diacritiques +
 *    minuscules. Comme les deux côtés sont déjà normalisés, un simple `LIKE`
 *    suffit (pas besoin de `ILIKE`/`mode:'insensitive'`).
 *  - On découpe en tokens (mots) et on exige que CHAQUE token apparaisse quelque
 *    part dans `searchText` (`LIKE ALL`). Comme `searchText` concatène prénom +
 *    nom + email + téléphone + ville…, taper « gagnon raphael » (ordre inversé,
 *    découpage prénom/nom incohérent, accents absents) trouve quand même la
 *    personne.
 *  - Repli flou (`pg_trgm` word_similarity) UNIQUEMENT si la recherche exacte ne
 *    renvoie rien → tolérance aux fautes de frappe (« gagon » → Gagnon).
 *
 * Sécurité : le nom de table provient d'une allowlist littérale (jamais d'une
 * entrée utilisateur) ; toutes les valeurs sont des paramètres liés (`Prisma.sql`
 * / `Prisma.join`) → aucune injection possible.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

/** Tables physiques (snake_case) portant une colonne générée `searchText`. */
const SEARCH_TABLES = {
  candidates: 'candidates',
  employees: 'employees',
  prospect_candidates: 'prospect_candidates',
} as const;

export type SearchTable = keyof typeof SEARCH_TABLES;

/** Plafonds de sécurité. */
const MAX_TOKENS = 12; // garde-fou contre une requête pathologique
const ID_CAP = 5000; // borne la liste d'ids injectée dans `id IN (...)`
const FUZZY_LIMIT = 30; // nb max de candidats du repli flou
const FUZZY_MIN_LEN = 3; // les trigrammes n'ont de sens qu'à partir de 3 caractères
const FUZZY_THRESHOLD = 0.3; // seuil word_similarity du repli flou

/**
 * Normalise une chaîne pour la recherche : suppression des accents (NFD) +
 * minuscules + trim. Doit rester ALIGNÉ avec `immutable_unaccent(lower(...))`
 * côté SQL (même contrat que cityNormalize/skill-normalization).
 */
export function normalizeForSearch(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Découpe une requête en tokens normalisés, dédupliqués et plafonnés.
 *
 * On découpe sur TOUT caractère non alphanumérique (espaces, mais aussi ( ) - .
 * @ / ' …) : ainsi un téléphone formaté « (514) 244-9672 » donne 514/244/9672
 * (qui matchent les chiffres stockés), « Jean-Pierre » donne jean/pierre, et un
 * email collé donne ses fragments. Si la requête contient un numéro (≥ 7
 * chiffres), on ajoute aussi le token « 10 derniers chiffres » (matche un
 * téléphone stocké avec indicatif pays, ex. +1).
 */
export function tokenizeQuery(raw: string): string[] {
  const norm = normalizeForSearch(raw);
  const tokens = norm ? norm.split(/[^a-z0-9]+/).filter(Boolean) : [];

  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length >= 7) tokens.push(digits.slice(-10));

  return [...new Set(tokens)].slice(0, MAX_TOKENS);
}

/** Référence de table sûre (allowlist littérale → jamais l'entrée utilisateur). */
function tableRef(table: SearchTable): Prisma.Sql {
  return Prisma.raw(`"${SEARCH_TABLES[table]}"`);
}

/**
 * Ids des lignes dont `searchText` contient TOUS les tokens (AND inter-tokens,
 * OR implicite inter-champs via la colonne concaténée). Ne filtre PAS la
 * visibilité (isDeleted/isActive/isArchived) : c'est l'appelant Prisma qui
 * applique son `where` habituel sur les ids retournés.
 */
export async function searchTableIds(table: SearchTable, raw: string): Promise<string[]> {
  const tokens = tokenizeQuery(raw);
  if (tokens.length === 0) return [];

  const likeArray = Prisma.sql`ARRAY[${Prisma.join(tokens.map((t) => `%${t}%`))}]`;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM ${tableRef(table)}
    WHERE "searchText" LIKE ALL(${likeArray})
    LIMIT ${ID_CAP}
  `);
  return rows.map((r) => r.id);
}

/**
 * Repli flou (tolérance aux fautes) : ids les plus proches par word_similarity
 * (pg_trgm). Seq scan assumé (≤ quelques milliers de lignes) — n'est appelé que
 * lorsque la recherche exacte ne renvoie rien, donc le chemin courant ne paie
 * jamais ce coût.
 */
export async function fuzzyTableIds(table: SearchTable, raw: string, limit = FUZZY_LIMIT): Promise<string[]> {
  const q = normalizeForSearch(raw);
  if (q.length < FUZZY_MIN_LEN) return [];

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM ${tableRef(table)}
    WHERE word_similarity(${q}, "searchText") > ${FUZZY_THRESHOLD}
    ORDER BY word_similarity(${q}, "searchText") DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => r.id);
}

/**
 * Résolution complète : tokens exacts d'abord, repli flou si aucun résultat.
 * Renvoie une liste d'ids (éventuellement vide → l'appelant injecte
 * `id IN (...)` ; une liste vide donne bien « aucun résultat »).
 *
 * IMPORTANT côté appelant : n'injecter `id IN (...)` QUE si la requête de
 * recherche est non vide (sinon `tokenizeQuery` renvoie `[]` et on ne doit pas
 * filtrer du tout).
 */
export async function resolveSearchIds(table: SearchTable, raw: string): Promise<string[]> {
  const exact = await searchTableIds(table, raw);
  if (exact.length > 0) return exact;
  return fuzzyTableIds(table, raw);
}

/** True si la requête produit au moins un token exploitable. */
export function hasSearchTokens(raw: string): boolean {
  return tokenizeQuery(raw).length > 0;
}
