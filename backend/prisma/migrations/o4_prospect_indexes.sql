-- O4 — Index composites sur prospect_candidates (idempotent).
-- Appliqué via `prisma db execute` (historique Neon divergent → pas migrate deploy).
-- CREATE INDEX IF NOT EXISTS = sûr, non destructif, instantané à cette échelle.
CREATE INDEX IF NOT EXISTS "prospect_candidates_isDeleted_submissionDate_idx"
  ON "prospect_candidates" ("isDeleted", "submissionDate");

CREATE INDEX IF NOT EXISTS "prospect_candidates_isDeleted_isConverted_submissionDate_idx"
  ON "prospect_candidates" ("isDeleted", "isConverted", "submissionDate");
