-- Ajout des champs vidéo + survey à ProspectCandidate (additif)
ALTER TABLE "prospect_candidates"
  ADD COLUMN "videoUrl" TEXT,
  ADD COLUMN "videoStoragePath" TEXT,
  ADD COLUMN "videoUploadedAt" TIMESTAMP(3),
  ADD COLUMN "ghlSubmissionId" TEXT,
  ADD COLUMN "surveyAnswers" JSONB,
  ADD COLUMN "source" TEXT;

-- ghlSubmissionId unique (les NULL restent distincts en Postgres)
CREATE UNIQUE INDEX "prospect_candidates_ghlSubmissionId_key" ON "prospect_candidates"("ghlSubmissionId");
CREATE INDEX "prospect_candidates_ghlSubmissionId_idx" ON "prospect_candidates"("ghlSubmissionId");
