-- ===========================================================================
-- Ordre manuel des grandeurs (variantes) d'un morceau d'uniforme.
-- 0 = pas d'ordre manuel → tri automatique par grandeur côté app.
--
-- Migration MANUELLE (prod Neon) :
--   npx prisma db execute --file ./prisma/migrations/20260616000000_add_variant_sort_order/migration.sql --schema ./prisma/schema.prisma
--   puis `npx prisma generate`. NE PAS utiliser `prisma migrate deploy`.
-- Additive et idempotente (ADD COLUMN IF NOT EXISTS).
-- ===========================================================================

ALTER TABLE "uniform_variants" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "uniform_variants_itemId_sortOrder_idx" ON "uniform_variants"("itemId", "sortOrder");
