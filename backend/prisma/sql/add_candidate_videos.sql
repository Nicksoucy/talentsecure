-- Vidéos typées par candidat (présentation, entrevue, …) : table 1-N.
-- Les colonnes video* de la table candidates restent un MIROIR de la vidéo de
-- type PRESENTATION (rétrocompat des surfaces client : catalogue, marketplace,
-- partage public).
-- Additif et idempotent : sûr à rejouer. À appliquer via :
--   npx prisma db execute --file prisma/sql/add_candidate_videos.sql --schema prisma/schema.prisma
-- puis : npx prisma generate
-- (JAMAIS prisma migrate deploy — historique Neon divergent.)

CREATE TABLE IF NOT EXISTS candidate_videos (
  "id"               text PRIMARY KEY,
  "candidateId"      text NOT NULL,
  "type"             text NOT NULL,
  "videoUrl"         text,
  "videoStoragePath" text,
  "videoSourceUrl"   text,
  "videoUploadedAt"  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"      text,
  "createdAt"        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS candidate_videos_candidateId_idx
  ON candidate_videos ("candidateId");

CREATE INDEX IF NOT EXISTS candidate_videos_candidateId_type_idx
  ON candidate_videos ("candidateId", "type");

-- Clé étrangère vers candidates (suppression en cascade). Idempotent.
DO $$ BEGIN
  ALTER TABLE candidate_videos
    ADD CONSTRAINT candidate_videos_candidateId_fkey
    FOREIGN KEY ("candidateId") REFERENCES candidates ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
