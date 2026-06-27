-- Offboarding uniformes : retour des uniformes des employés qui quittent.
-- 1) Champs de fin d'emploi sur les employés (échéance de retour des uniformes).
-- 2) Nouveau type de notification pour les anciens employés détenant des pièces.

-- 1) Employés ------------------------------------------------------------------
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "terminationDate" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "uniformReturnDeadlineAt" TIMESTAMP(3);

-- 2) Enum NotificationType -----------------------------------------------------
-- ALTER TYPE ... ADD VALUE ne peut pas tourner dans une transaction sur certaines
-- versions de Postgres ; exécuter cette instruction hors transaction si besoin.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'UNIFORM_INACTIVE_EMPLOYEE_HAS_HOLDINGS';
