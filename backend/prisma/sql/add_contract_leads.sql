-- Leads de contrat (ex. « PSB ») — rattache une personne prospect/candidat/
-- employé à un contrat client. Alimente la couche colorée des cartes et la
-- puce des listes. Additif et idempotent : sûr à rejouer. À appliquer via :
--   npx prisma db execute --file prisma/sql/add_contract_leads.sql --schema prisma/schema.prisma
-- puis : npx prisma generate
-- (JAMAIS prisma migrate deploy — historique Neon divergent.)
--
-- Aucune FK vers prospect_candidates / candidates / employees : cette table ne
-- peut donc ni bloquer ni cascader une suppression de personne. La rejouer ou
-- la supprimer n'a aucun effet sur les données de personnes.

CREATE TABLE IF NOT EXISTS contract_leads (
  id                 text PRIMARY KEY,
  "contractCode"     text NOT NULL,
  "personType"       text NOT NULL,
  "personId"         text NOT NULL,
  "sourceCvFile"     text,
  "matchEmail"       text,
  "matchPhoneDigits" text,
  note               text,
  "addedAt"          timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt"        timestamp(3),
  "createdAt"        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Idempotence de l'import : un seul tag par (contrat, section, personne).
CREATE UNIQUE INDEX IF NOT EXISTS contract_leads_unique_idx
  ON contract_leads ("contractCode", "personType", "personId");
-- Lecture de la couche carte : tous les tags actifs d'un contrat.
CREATE INDEX IF NOT EXISTS contract_leads_code_idx
  ON contract_leads ("contractCode", "removedAt");
-- Puce des listes : les contrats d'une page de personnes.
CREATE INDEX IF NOT EXISTS contract_leads_person_idx
  ON contract_leads ("personType", "personId");
