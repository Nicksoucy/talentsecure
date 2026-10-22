-- Métier(s) de l'employé : agent de sécurité (SECURITE) et/ou signaleur
-- (SIGNALISATION) — même vocabulaire que les divisions d'uniformes. Une personne
-- peut faire les deux. Tous les employés existants deviennent « agent de
-- sécurité » (valeur par défaut) ; l'import du roster Agendrix signalisation
-- ajoute ensuite le métier signaleur.
-- Additif et idempotent : sûr à rejouer. À appliquer via :
--   npx prisma db execute --file prisma/sql/add_employee_divisions.sql --schema prisma/schema.prisma
-- puis : npx prisma generate
-- (JAMAIS prisma migrate deploy — historique Neon divergent.)

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS divisions "UniformDivision"[] NOT NULL
    DEFAULT ARRAY['SECURITE']::"UniformDivision"[];
