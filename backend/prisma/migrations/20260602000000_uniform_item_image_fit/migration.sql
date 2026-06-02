-- ===========================================================================
-- Module UNIFORMES — réglage d'affichage de la photo par morceau.
-- 'cover' (remplir, rogne) ou 'contain' (photo entière). NULL = 'cover' (défaut).
--
-- Migration MANUELLE (prod Neon) :
--   npx prisma db execute --file ./prisma/migrations/20260602000000_uniform_item_image_fit/migration.sql --schema ./prisma/schema.prisma
--   puis `npx prisma generate`. NE PAS utiliser `prisma migrate deploy`.
-- Idempotent : ré-exécutable sans erreur (IF NOT EXISTS).
-- ===========================================================================

ALTER TABLE "uniform_items"
  ADD COLUMN IF NOT EXISTS "imageFit" TEXT;
