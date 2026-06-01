-- ===========================================================================
-- Module UNIFORMES — photo par morceau (catalogue visuel).
-- Stocke la clé R2 de l'image; l'API renvoie une URL signée pour l'affichage.
--
-- Migration MANUELLE (prod Neon) :
--   npx prisma db execute --file ./prisma/migrations/20260531020000_uniform_item_image/migration.sql --schema ./prisma/schema.prisma
--   puis `npx prisma generate`. NE PAS utiliser `prisma migrate deploy`.
-- Idempotent : ré-exécutable sans erreur (IF NOT EXISTS).
-- ===========================================================================

ALTER TABLE "uniform_items"
  ADD COLUMN IF NOT EXISTS "imageStoragePath" TEXT;
