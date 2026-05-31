-- ===========================================================================
-- Module UNIFORMES — inventaire à DEUX EMPLACEMENTS (back office / front office).
-- Migration MANUELLE (prod Neon) : appliquer via
--   npx prisma db execute --file ./prisma/migrations/20260531000000_add_uniform_stock_locations/migration.sql --schema ./prisma/schema.prisma
-- puis `npx prisma generate`. NE PAS utiliser `prisma migrate deploy`.
-- Aucun ALTER sur "users" ni "employees".
--
-- Modèle : UniformVariant.quantityOnHand reste le cache du TOTAL. La nouvelle
-- table uniform_variant_stock ventile ce total entre BACK_OFFICE et FRONT_OFFICE.
-- Backfill : tout le stock existant -> BACK_OFFICE ; FRONT_OFFICE démarre à 0.
-- Idempotent : ré-exécutable sans erreur (IF NOT EXISTS / ON CONFLICT).
-- ===========================================================================

-- 1. Nouvel enum d'emplacement ------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "UniformStockLocation" AS ENUM ('BACK_OFFICE', 'FRONT_OFFICE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Étendre l'enum des mouvements avec TRANSFER ------------------------------
--    (déplacement entre emplacements ; non utilisé dans cette migration, donc
--     sûr à ajouter même si l'enum est consommé ailleurs.)
ALTER TYPE "UniformMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER';

-- 3. Table de stock par emplacement ------------------------------------------
CREATE TABLE IF NOT EXISTS "uniform_variant_stock" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "location" "UniformStockLocation" NOT NULL,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uniform_variant_stock_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uniform_variant_stock_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "uniform_variants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "uniform_variant_stock_variantId_idx"
  ON "uniform_variant_stock" ("variantId");
CREATE UNIQUE INDEX IF NOT EXISTS "uniform_variant_stock_variantId_location_key"
  ON "uniform_variant_stock" ("variantId", "location");

-- 4. Colonne d'emplacement sur le registre des mouvements --------------------
--    Toutes les lignes historiques -> BACK_OFFICE (tout le stock y était).
ALTER TABLE "uniform_stock_movements"
  ADD COLUMN IF NOT EXISTS "location" "UniformStockLocation" NOT NULL DEFAULT 'BACK_OFFICE';

CREATE INDEX IF NOT EXISTS "uniform_stock_movements_location_idx"
  ON "uniform_stock_movements" ("location");

-- 5. Source de décrément sur les remises -------------------------------------
--    Astuce de backfill : on ajoute la colonne avec DEFAULT 'BACK_OFFICE' pour
--    que TOUTES les remises EXISTANTES héritent de BACK_OFFICE (l'annulation
--    future ré-incrémentera au bon endroit), PUIS on bascule le défaut vers
--    'FRONT_OFFICE' pour les nouvelles remises (= défaut métier voulu).
ALTER TABLE "uniform_issuances"
  ADD COLUMN IF NOT EXISTS "sourceLocation" "UniformStockLocation" NOT NULL DEFAULT 'BACK_OFFICE';
ALTER TABLE "uniform_issuances"
  ALTER COLUMN "sourceLocation" SET DEFAULT 'FRONT_OFFICE';

-- 6. Backfill du stock par emplacement ---------------------------------------
--    a) BACK_OFFICE = quantité actuelle (tout le stock y est).
INSERT INTO "uniform_variant_stock" ("id", "variantId", "location", "quantityOnHand", "updatedAt")
SELECT gen_random_uuid(), v."id", 'BACK_OFFICE', v."quantityOnHand", CURRENT_TIMESTAMP
FROM "uniform_variants" v
ON CONFLICT ("variantId", "location") DO NOTHING;

--    b) FRONT_OFFICE = 0 (rien au comptoir au départ).
INSERT INTO "uniform_variant_stock" ("id", "variantId", "location", "quantityOnHand", "updatedAt")
SELECT gen_random_uuid(), v."id", 'FRONT_OFFICE', 0, CURRENT_TIMESTAMP
FROM "uniform_variants" v
ON CONFLICT ("variantId", "location") DO NOTHING;
