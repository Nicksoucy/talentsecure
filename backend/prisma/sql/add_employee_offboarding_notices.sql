-- Fermeture de dossier employé : trace de chaque avis envoyé (courriel + texto)
-- à l'employé congédié / démissionnaire, avec la date limite de retour des
-- uniformes et le montant annoncé. Additif et idempotent : sûr à rejouer.
-- À appliquer via :
--   npx prisma db execute --file prisma/sql/add_employee_offboarding_notices.sql --schema prisma/schema.prisma
-- puis : npx prisma generate
-- (JAMAIS prisma migrate deploy — historique Neon divergent.)

CREATE TABLE IF NOT EXISTS employee_offboarding_notices (
  id                 text PRIMARY KEY,
  "employeeId"       text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  "sentById"         text,
  "sentByName"       text,
  "sentAt"           timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason             text NOT NULL,
  "reasonText"       text NOT NULL,
  "returnDeadlineAt" timestamp(3) NOT NULL,
  "emailTo"          text,
  "emailCc"          text[] NOT NULL DEFAULT ARRAY[]::text[],
  "emailStatus"      text NOT NULL,
  "emailError"       text,
  "smsTo"            text,
  "smsStatus"        text NOT NULL,
  "smsError"         text,
  "estimatedAmount"  decimal(10,2) NOT NULL DEFAULT 0,
  "piecesSnapshot"   jsonb NOT NULL DEFAULT '[]'::jsonb,
  "htmlSnapshot"     text NOT NULL,
  "createdAt"        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS employee_offboarding_notices_employee_idx
  ON employee_offboarding_notices ("employeeId", "sentAt");
