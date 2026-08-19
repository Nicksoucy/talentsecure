-- Profil des mandats : exigences dures, quarts à couvrir et contexte de travail
-- coté par la répartition. L'import Agendrix ne fournit que l'identité et
-- l'adresse ; tout ce qui suit est saisi à la main et n'est jamais écrasé.
--
-- Additif et idempotent : sûr à rejouer. À appliquer via :
--   npx prisma db execute --file prisma/sql/add_mandate_profile.sql --schema prisma/schema.prisma
-- puis : npx prisma generate
-- (JAMAIS prisma migrate deploy — historique Neon divergent.)

-- Exigences dures. requiresBSP à true par défaut : c'est la règle du métier,
-- un mandat qui n'exige pas le permis est l'exception.
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "requiresBSP"           boolean NOT NULL DEFAULT true;
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "requiresDriverLicense" boolean NOT NULL DEFAULT false;
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "requiresVehicle"       boolean NOT NULL DEFAULT false;
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "requiredLanguages"     text[]  NOT NULL DEFAULT '{}';

-- Quarts à couvrir (mêmes 4 quarts que le candidat).
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "shiftDays"     boolean NOT NULL DEFAULT false;
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "shiftEvenings" boolean NOT NULL DEFAULT false;
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "shiftNights"   boolean NOT NULL DEFAULT false;
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "shiftWeekends" boolean NOT NULL DEFAULT false;

-- Contexte de travail, coté 1-5 (NULL = pas encore coté, à distinguer de 1).
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "siteType"          text;
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "conflictFrequency" integer;
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "publicContact"     integer;
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "monotony"          integer;
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "autonomy"          integer;
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "outdoorExposure"   integer;
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "physicalDemand"    integer;

ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "clientName" text;
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "headcount"  integer;
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "notes"      text;

-- Distinct de isDeleted : un mandat inactif reste consultable mais sort du
-- jumelage.
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true;

ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "profileUpdatedAt"   timestamp(3);
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS "profileUpdatedById" text;

-- Liste des mandats à pourvoir (écran de répartition).
CREATE INDEX IF NOT EXISTS mandates_is_active_is_deleted_idx ON mandates ("isActive", "isDeleted");
