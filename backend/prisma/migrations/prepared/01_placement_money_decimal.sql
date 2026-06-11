-- ============================================================================
-- D5 (audit) — Argent des placements en DECIMAL au lieu de FLOAT.
-- FLOAT (virgule flottante binaire) ne représente pas exactement les montants
-- → erreurs d'arrondi sur les salaires/commissions. Le reste de l'app utilise
-- déjà Decimal. Migration à faible risque (les nombres passent tels quels,
-- juste re-stockés proprement). Ré-exécutable sans danger.
--
-- Table : placements  (Prisma model Placement → @@map("placements"))
-- Colonnes : hourlyRate, commissionRate, commissionAmount  (toutes nullable)
--
-- ⚠️ Vérifie la convention de commissionRate : si c'est un POURCENTAGE stocké en
--    fraction (0.15 = 15 %), Decimal(6,4) garde la précision (0.1500). Si c'est
--    stocké en entier (15 = 15 %), Decimal(6,4) donne 15.0000 — ok aussi.
-- ============================================================================

ALTER TABLE "placements"
  ALTER COLUMN "hourlyRate"       TYPE DECIMAL(10,2) USING ROUND("hourlyRate"::numeric, 2);

ALTER TABLE "placements"
  ALTER COLUMN "commissionAmount" TYPE DECIMAL(10,2) USING ROUND("commissionAmount"::numeric, 2);

ALTER TABLE "placements"
  ALTER COLUMN "commissionRate"   TYPE DECIMAL(6,4)  USING ROUND("commissionRate"::numeric, 4);

-- ----------------------------------------------------------------------------
-- SCHÉMA — à appliquer dans prisma/schema.prisma APRÈS le SQL ci-dessus
-- (model Placement, lignes ~555-557), puis `npx prisma generate` :
--
--   hourlyRate       Decimal? @db.Decimal(10, 2)
--   commissionRate   Decimal? @db.Decimal(6, 4)   // Taux de commission (ex: 15%)
--   commissionAmount Decimal? @db.Decimal(10, 2)  // Montant commission
--
-- ⚠️ Côté code : Prisma renvoie les Decimal comme objets (Prisma.Decimal), pas
--    des number. Cherche les usages de placement.hourlyRate / commissionRate /
--    commissionAmount et entoure de Number(...) si un calcul JS les utilise.
-- ----------------------------------------------------------------------------
