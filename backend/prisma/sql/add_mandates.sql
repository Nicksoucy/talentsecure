-- Mandats (sites/postes XGuard, source export Agendrix « Ressources ») — couche
-- rose des cartes. Additif et idempotent : sûr à rejouer. À appliquer via :
--   npx prisma db execute --file prisma/sql/add_mandates.sql --schema prisma/schema.prisma
-- puis : npx prisma generate
-- (JAMAIS prisma migrate deploy — historique Neon divergent.)

CREATE TABLE IF NOT EXISTS mandates (
  id              text PRIMARY KEY,
  "externalId"    text NOT NULL,
  name            text NOT NULL,
  address         text,
  city            text,
  province        text NOT NULL DEFAULT 'QC',
  "postalCode"    text,
  lat             double precision,
  lng             double precision,
  "geocodedAt"    timestamp(3),
  "geocodeSource" text,
  "isDeleted"     boolean NOT NULL DEFAULT false,
  "deletedAt"     timestamp(3),
  "createdAt"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Dédup import par identifiant Agendrix (GAR/S00/TEC).
CREATE UNIQUE INDEX IF NOT EXISTS mandates_external_id_idx ON mandates ("externalId");
-- Filtres de lecture + pré-filtre bounding-box éventuel.
CREATE INDEX IF NOT EXISTS mandates_is_deleted_idx ON mandates ("isDeleted");
CREATE INDEX IF NOT EXISTS mandates_lat_lng_idx ON mandates (lat, lng);
