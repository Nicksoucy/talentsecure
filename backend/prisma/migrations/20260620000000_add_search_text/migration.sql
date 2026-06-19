-- Recherche de personnes insensible aux accents/casse + tokenisée + floue.
--
-- Ajoute une colonne GÉNÉRÉE `searchText` (maintenue par Postgres, donc jamais
-- désynchronisée et backfillée automatiquement) sur candidates / employees /
-- prospect_candidates, plus un index trigramme GIN pour accélérer LIKE et la
-- similarité floue.
--
-- ⚠️ Cette colonne et ses index N'EXISTENT QUE dans cette migration : ils ne
-- sont PAS déclarés dans schema.prisma (Prisma tenterait de les écrire et
-- Postgres rejette toute écriture sur une colonne GENERATED ALWAYS). On les lit
-- via $queryRaw (cf. src/utils/search.ts). Appliquer avec `prisma migrate
-- deploy` — ne PAS faire `db pull`/`migrate dev` (qui voudraient annuler la
-- « dérive »).

-- 1) Extensions (idempotent ; supportées par Neon).
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2) Wrapper IMMUTABLE autour de unaccent (le unaccent natif est seulement
--    STABLE → interdit dans une colonne générée / un index). On épingle le
--    dictionnaire et on qualifie public.unaccent pour rester indépendant du
--    search_path (évalué de façon restreinte dans une colonne générée).
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $$
  SELECT public.unaccent('public.unaccent', $1)
$$;

-- 3) Colonnes générées STORED.
--    ⚠️ On utilise l'opérateur `||` (IMMUTABLE) et NON `concat_ws` (qui est
--    seulement STABLE → « generation expression is not immutable »). Chaque
--    champ est coalescé à '' pour éviter qu'un NULL annule toute la chaîne.
--    `regexp_replace(..., '\D', '', 'g')` ajoute le téléphone en chiffres seuls
--    (matche n'importe quel format saisi).
ALTER TABLE "candidates"
  ADD COLUMN "searchText" text
  GENERATED ALWAYS AS (
    immutable_unaccent(lower(
      coalesce("firstName", '') || ' ' ||
      coalesce("lastName", '')  || ' ' ||
      coalesce("email", '')     || ' ' ||
      coalesce("phone", '')     || ' ' ||
      regexp_replace(coalesce("phone", ''), '\D', '', 'g') || ' ' ||
      coalesce("city", '')
    ))
  ) STORED;

ALTER TABLE "prospect_candidates"
  ADD COLUMN "searchText" text
  GENERATED ALWAYS AS (
    immutable_unaccent(lower(
      coalesce("firstName", '') || ' ' ||
      coalesce("lastName", '')  || ' ' ||
      coalesce("email", '')     || ' ' ||
      coalesce("phone", '')     || ' ' ||
      regexp_replace(coalesce("phone", ''), '\D', '', 'g') || ' ' ||
      coalesce("city", '')
    ))
  ) STORED;

ALTER TABLE "employees"
  ADD COLUMN "searchText" text
  GENERATED ALWAYS AS (
    immutable_unaccent(lower(
      coalesce("firstName", '')  || ' ' ||
      coalesce("lastName", '')   || ' ' ||
      coalesce("email", '')      || ' ' ||
      coalesce("phone", '')      || ' ' ||
      regexp_replace(coalesce("phone", ''), '\D', '', 'g') || ' ' ||
      coalesce("city", '')       || ' ' ||
      coalesce("assignment", '') || ' ' ||
      coalesce("position", '')
    ))
  ) STORED;

-- 4) Index trigramme GIN : accélère LIKE '%token%' ET le repli word_similarity.
CREATE INDEX IF NOT EXISTS "candidates_searchText_trgm_idx"
  ON "candidates" USING gin ("searchText" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "prospect_candidates_searchText_trgm_idx"
  ON "prospect_candidates" USING gin ("searchText" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "employees_searchText_trgm_idx"
  ON "employees" USING gin ("searchText" gin_trgm_ops);
