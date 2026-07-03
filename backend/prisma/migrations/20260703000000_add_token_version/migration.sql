-- P2-C : révocation de session par version de token (cf. passport.ts).
-- BLOQUANT au déploiement : passport lit user.tokenVersion / client.tokenVersion
-- à CHAQUE requête authentifiée — appliquer ce SQL AVANT de déployer le code.
-- Additif et compatible avec l'ancien code (main l'ignore).

ALTER TABLE "users"   ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
