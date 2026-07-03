-- Retour tardif : pièces rapportées après la clôture de fin d'emploi
-- (remise CLOSED_TERMINATION). Additif, compatible avec l'ancien code.
ALTER TABLE "uniform_returns" ADD COLUMN IF NOT EXISTS "isLateReturn" BOOLEAN NOT NULL DEFAULT false;
