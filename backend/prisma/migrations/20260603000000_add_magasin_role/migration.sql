-- ===========================================================================
-- Rôle d'accès MAGASIN (lecture seule : employés + module uniformes).
--
-- Migration MANUELLE (prod Neon) :
--   npx prisma db execute --file ./prisma/migrations/20260603000000_add_magasin_role/migration.sql --schema ./prisma/schema.prisma
--   puis `npx prisma generate`. NE PAS utiliser `prisma migrate deploy`.
-- Idempotent (ADD VALUE IF NOT EXISTS). « ALTER TYPE ... ADD VALUE » ne doit pas
-- réutiliser la valeur dans le même fichier -> garder cette migration seule.
-- ===========================================================================

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MAGASIN';
