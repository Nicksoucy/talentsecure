-- Table de cache de géocodage des villes (carte candidats potentiels).
-- Appliqué via `prisma db execute` (historique Neon divergent → pas migrate deploy).
-- Additif et idempotent : aucun impact sur les tables existantes.
CREATE TABLE IF NOT EXISTS "city_geocodes" (
  "id"        TEXT NOT NULL,
  "cityKey"   TEXT NOT NULL,
  "city"      TEXT NOT NULL,
  "lat"       DOUBLE PRECISION,
  "lng"       DOUBLE PRECISION,
  "found"     BOOLEAN NOT NULL DEFAULT false,
  "source"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "city_geocodes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "city_geocodes_cityKey_key" ON "city_geocodes" ("cityKey");
