-- Backfill SÛR des vidéos existantes vers candidate_videos.
-- Pour chaque candidat ayant une vidéo (videoStoragePath non nul) et SANS ligne
-- candidate_videos : on crée une ligne typée
--   PRESENTATION  si la clé de stockage == celle du prospect d'origine
--                 (donc certainement la vidéo de présentation reprise),
--   INTERVIEW     sinon (vidéo remplacée/uploadée manuellement — non prouvée
--                 comme présentation, on ne la mé-étiquette pas).
-- Idempotent (clause NOT EXISTS) : sûr à rejouer. À appliquer APRÈS
-- add_candidate_videos.sql, via :
--   npx prisma db execute --file prisma/sql/backfill_candidate_videos.sql --schema prisma/schema.prisma

INSERT INTO candidate_videos (
  "id", "candidateId", "type", "videoUrl", "videoStoragePath",
  "videoSourceUrl", "videoUploadedAt", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  c."id",
  CASE WHEN EXISTS (
    SELECT 1 FROM prospect_candidates p
    WHERE (p."convertedToId" = c."id" OR p."id" = c."id")
      AND p."videoStoragePath" IS NOT NULL
      AND p."videoStoragePath" = c."videoStoragePath"
  ) THEN 'PRESENTATION' ELSE 'INTERVIEW' END,
  c."videoUrl",
  c."videoStoragePath",
  NULL,
  COALESCE(c."videoUploadedAt", CURRENT_TIMESTAMP),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM candidates c
WHERE c."videoStoragePath" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM candidate_videos v WHERE v."candidateId" = c."id"
  );
