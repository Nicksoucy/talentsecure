-- Disponibilités : le quart « soir » manquait côté candidat, et le prospect
-- n'avait aucune colonne de disponibilité (la réponse du formulaire GHL
-- « Renseignements étudiants » restait enfouie dans surveyAnswers).
-- Additif et idempotent : sûr à rejouer. À appliquer via :
--   npx prisma db execute --file prisma/sql/add_availability_evenings.sql --schema prisma/schema.prisma
-- puis : npx prisma generate
-- (JAMAIS prisma migrate deploy — historique Neon divergent.)

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "availableEvenings" boolean NOT NULL DEFAULT false;

ALTER TABLE prospect_candidates
  ADD COLUMN IF NOT EXISTS "available24_7"     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "availableDays"     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "availableEvenings" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "availableNights"   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "availableWeekends" boolean NOT NULL DEFAULT false;

-- Symétrique de candidates_available24_7_idx : le quart « soir » est filtrable
-- depuis la recherche avancée et le portail client.
CREATE INDEX IF NOT EXISTS candidates_available_evenings_idx
  ON candidates ("availableEvenings");
