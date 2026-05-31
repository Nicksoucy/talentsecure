-- ===========================================================================
-- Module UNIFORMES — emplacement source PAR LIGNE de remise.
-- Permet de mélanger front (casier) et back (bac) dans une même remise :
-- chaque pièce scannée garde l'emplacement encodé dans son QR (-F / -B).
-- NULL = la ligne hérite de uniform_issuances."sourceLocation" (rétro-compat).
--
-- Migration MANUELLE (prod Neon) :
--   npx prisma db execute --file ./prisma/migrations/20260531010000_issuance_line_source_location/migration.sql --schema ./prisma/schema.prisma
--   puis `npx prisma generate`. NE PAS utiliser `prisma migrate deploy`.
-- Idempotent : ré-exécutable sans erreur (IF NOT EXISTS).
-- L'enum "UniformStockLocation" existe déjà (migration précédente).
-- ===========================================================================

ALTER TABLE "uniform_issuance_lines"
  ADD COLUMN IF NOT EXISTS "sourceLocation" "UniformStockLocation";
