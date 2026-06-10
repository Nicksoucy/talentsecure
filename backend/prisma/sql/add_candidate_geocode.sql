-- Géolocalisation par candidat (recherche par point + rayon, carte secteurs).
-- Additif et idempotent : sûr à rejouer. À appliquer via :
--   npx prisma db execute --file prisma/sql/add_candidate_geocode.sql --schema prisma/schema.prisma
-- puis : npx prisma generate
-- (JAMAIS prisma migrate deploy — historique Neon divergent.)

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS "geocodedAt" timestamp(3),
  ADD COLUMN IF NOT EXISTS "geocodeSource" text;

-- Pré-filtre bounding-box de la recherche "nearby".
CREATE INDEX IF NOT EXISTS candidates_lat_lng_idx
  ON candidates (lat, lng);
