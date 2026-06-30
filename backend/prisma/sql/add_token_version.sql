-- P2-C — Révocation de session (tokenVersion).
--
-- Colonne incrémentée au logout (et, à terme, au changement de mot de passe) :
-- la stratégie JWT (config/passport.ts) et /refresh rejettent tout token dont
-- la version ne correspond plus → révocation IMMÉDIATE, sans coût (l'utilisateur
-- est déjà chargé en DB par la stratégie).
--
-- Additif + idempotent : aucune donnée existante touchée (DEFAULT 0).
-- Appliqué manuellement à Neon (prod) le 2026-06-30 ; la CI le crée via
-- `prisma db push` à partir de schema.prisma. Colonnes en camelCase (convention
-- du schéma — pas de @map sur les champs).
ALTER TABLE users   ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
