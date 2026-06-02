-- ===========================================================================
-- Nouveau rôle MAGASIN_GESTION : gestion complète du module uniformes
-- (catalogue, inventaire, remises, retours, lavage) + lecture des employés,
-- sans accès au recrutement (candidats / candidats potentiels / clients).
--
-- Migration MANUELLE (prod Neon) :
--   npx prisma db execute --file ./prisma/migrations/20260602100000_role_magasin_gestion/migration.sql --schema ./prisma/schema.prisma
--   puis `npx prisma generate`. NE PAS utiliser `prisma migrate deploy`.
-- Ajout de valeur d'enum Postgres : idempotent (IF NOT EXISTS).
-- ===========================================================================

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MAGASIN_GESTION';
