# ============================================================================
# Optionnel — Active le fallback Cloud Scheduler en configurant le token sécurisé.
#
# Le scheduler in-process (node-cron + min-instances=1) tourne déjà sans token.
# Cet endpoint /api/notifications/internal/dispatch est un FALLBACK pour le cas
# où on voudrait que Cloud Scheduler GCP appelle le dispatch (gratuit jusqu'à 3 jobs).
#
# Usage :
#   1. gcloud auth login   (si pas déjà fait)
#   2. .\set-internal-job-token.ps1
# ============================================================================

$ErrorActionPreference = 'Stop'

# Token généré une seule fois — à coller dans Cloud Scheduler comme header x-internal-token
$TOKEN = 'KYjRFQ5pLXxWjFdxplSJqNbX3eIc7wfWjzcuGKk6'

Write-Host "Configuration du token INTERNAL_JOB_TOKEN sur talentsecure-backend..."

gcloud run services update talentsecure-backend `
    --region=northamerica-northeast1 `
    --update-env-vars="INTERNAL_JOB_TOKEN=$TOKEN"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "OK — Token configure."
    Write-Host ""
    Write-Host "Pour creer un Cloud Scheduler job qui appelle l'endpoint :"
    Write-Host ""
    Write-Host "  gcloud scheduler jobs create http talentsecure-notifications-dispatch \"
    Write-Host "    --location=northamerica-northeast1 \"
    Write-Host "    --schedule='*/5 * * * *' \"
    Write-Host "    --uri='https://talentsecure-572017163659.northamerica-northeast1.run.app/api/notifications/internal/dispatch' \"
    Write-Host "    --http-method=POST \"
    Write-Host "    --headers='x-internal-token=$TOKEN'"
}
