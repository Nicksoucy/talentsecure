-- Registre : une action peut être faite par le système (clôture automatique des
-- uniformes, import Agendrix) → userId devient facultatif.
-- Idempotent ; à appliquer sur Neon AVANT le déploiement du code.
ALTER TABLE audit_logs ALTER COLUMN "userId" DROP NOT NULL;

-- Historique d'un dossier (fiche employé) : lecture par resourceId.
CREATE INDEX IF NOT EXISTS "audit_logs_resourceId_idx" ON audit_logs ("resourceId");
