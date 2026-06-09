-- Géolocalisation par prospect (recherche par point + rayon).
-- Additif et idempotent : sûr à rejouer. À appliquer via :
--   npx prisma db execute --file prisma/sql/add_prospect_geocode.sql --schema prisma/schema.prisma
-- puis : npx prisma generate
-- (JAMAIS prisma migrate deploy — historique Neon divergent.)

ALTER TABLE prospect_candidates
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS "geocodedAt" timestamp(3),
  ADD COLUMN IF NOT EXISTS "geocodeSource" text;

-- Pré-filtre bounding-box de la recherche "nearby".
CREATE INDEX IF NOT EXISTS prospect_candidates_lat_lng_idx
  ON prospect_candidates (lat, lng);
