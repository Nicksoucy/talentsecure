-- Questionnaire de préférences de travail et d'affectation.
-- Rempli par le candidat sur une page publique ; sert à PROPOSER des mandats,
-- jamais à écarter (CDPDJ recommandation 7 ; art. 12.1 de la Loi sur le privé).
--
-- Additif et idempotent : sûr à rejouer. À appliquer via :
--   npx prisma db execute --file prisma/sql/add_questionnaire.sql --schema prisma/schema.prisma
-- puis : npx prisma generate
-- (JAMAIS prisma migrate deploy — historique Neon divergent.)

CREATE TABLE IF NOT EXISTS questionnaire_responses (
  id                      text PRIMARY KEY,
  "personType"            text NOT NULL,
  "personId"              text NOT NULL,
  version                 text NOT NULL,
  "accessToken"           text NOT NULL,
  "expiresAt"             timestamp(3) NOT NULL,
  status                  text NOT NULL DEFAULT 'IN_PROGRESS',
  "startedAt"             timestamp(3),
  "completedAt"           timestamp(3),
  "consentAt"             timestamp(3),
  "prefConflictTolerance" integer,
  "prefPublicContact"     integer,
  "prefMonotonyTolerance" integer,
  "prefAutonomy"          integer,
  "prefOutdoorTolerance"  integer,
  "prefPhysicalTolerance" integer,
  "traitDependability"    double precision,
  "traitIntegrity"        double precision,
  "traitSelfControl"      double precision,
  "traitStressTolerance"  double precision,
  "qualityFlags"          text[] NOT NULL DEFAULT '{}',
  careless                boolean NOT NULL DEFAULT false,
  source                  text NOT NULL,
  "createdById"           text,
  "createdAt"             timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Le jeton est l'identifiant public : il doit être unique, et la contrainte est
-- ce qui garantit qu'une collision ne donne jamais accès à la mauvaise fiche.
CREATE UNIQUE INDEX IF NOT EXISTS questionnaire_responses_access_token_idx
  ON questionnaire_responses ("accessToken");
-- Lecture principale : la dernière réponse complétée d'une personne.
CREATE INDEX IF NOT EXISTS questionnaire_responses_person_idx
  ON questionnaire_responses ("personType", "personId", status);
CREATE INDEX IF NOT EXISTS questionnaire_responses_status_idx
  ON questionnaire_responses (status);

CREATE TABLE IF NOT EXISTS questionnaire_answers (
  id           text PRIMARY KEY,
  "responseId" text NOT NULL REFERENCES questionnaire_responses(id) ON DELETE CASCADE,
  "itemId"     text NOT NULL,
  value        integer NOT NULL,
  "elapsedMs"  integer,
  "answeredAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Une seule réponse par énoncé : c'est cette contrainte qui rend l'upsert de
-- sauvegarde automatique idempotent quand le candidat revient sur ses pas.
CREATE UNIQUE INDEX IF NOT EXISTS questionnaire_answers_response_item_idx
  ON questionnaire_answers ("responseId", "itemId");
CREATE INDEX IF NOT EXISTS questionnaire_answers_response_idx
  ON questionnaire_answers ("responseId");
