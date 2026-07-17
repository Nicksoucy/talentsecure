-- Géolocalisation par employé (carte des agents actifs, précision adresse ;
-- recherche par point + rayon). Additif et idempotent : sûr à rejouer. À appliquer via :
--   npx prisma db execute --file prisma/sql/add_employee_geocode.sql --schema prisma/schema.prisma
-- puis : npx prisma generate
-- (JAMAIS prisma migrate deploy — historique Neon divergent.)

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS "geocodedAt" timestamp(3),
  ADD COLUMN IF NOT EXISTS "geocodeSource" text;

-- Pré-filtre bounding-box de la recherche "nearby".
CREATE INDEX IF NOT EXISTS employees_lat_lng_idx
  ON employees (lat, lng);
