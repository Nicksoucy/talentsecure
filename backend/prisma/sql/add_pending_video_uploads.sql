-- Vidéos de présentation téléversées par le candidat sur la page publique
-- /ma-video, AVANT que le webhook GHL n'ait créé sa fiche ProspectCandidate.
--
-- Pourquoi une table tampon : la redirection du formulaire GHL est instantanée,
-- le webhook qui crée le prospect arrive quelques secondes (parfois minutes)
-- plus tard. L'upload doit donc pouvoir aboutir sans prospect existant, puis
-- être « réclamé » à la création (webhook, synchro survey, ou balayage cron).
--
-- Pas de clé étrangère vers prospect_candidates : la ligne existe justement
-- avant le prospect. `claimedByProspectId` est une référence souple.
--
-- Additif et idempotent : sûr à rejouer. À appliquer via :
--   npx prisma db execute --file prisma/sql/add_pending_video_uploads.sql --schema prisma/schema.prisma
-- puis : npx prisma generate
-- (JAMAIS prisma migrate deploy — historique Neon divergent.)

CREATE TABLE IF NOT EXISTS pending_video_uploads (
  "id"                  text PRIMARY KEY,
  "ghlContactId"        text NOT NULL,
  "email"               text,
  "phone"               text,
  "storagePath"         text NOT NULL,
  "originalName"        text,
  "contentType"         text,
  "sizeBytes"           integer,
  "claimedByProspectId" text,
  "claimedAt"           timestamp(3),
  "createdAt"           timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Un seul upload en cours par contact GHL : un renvoi écrase le précédent
-- (upsert côté applicatif) plutôt que d'empiler des orphelins.
CREATE UNIQUE INDEX IF NOT EXISTS pending_video_uploads_ghlContactId_key
  ON pending_video_uploads ("ghlContactId");

-- Réclamation : on cherche par courriel ou téléphone, restreint aux non réclamés.
CREATE INDEX IF NOT EXISTS pending_video_uploads_email_idx
  ON pending_video_uploads ("email");

CREATE INDEX IF NOT EXISTS pending_video_uploads_phone_idx
  ON pending_video_uploads ("phone");

CREATE INDEX IF NOT EXISTS pending_video_uploads_claimedAt_idx
  ON pending_video_uploads ("claimedAt");
