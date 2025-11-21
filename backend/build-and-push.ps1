# PowerShell script to manually build and push the Docker image
# Run this from the backend directory

$PROJECT_ID = "talentsecure"
$REGION = "northamerica-northeast1"
$SERVICE_NAME = "talentsecure"
$REGISTRY = "$REGION-docker.pkg.dev"
$IMAGE_PATH = "$REGISTRY/$PROJECT_ID/cloud-run-source-deploy/$SERVICE_NAME/$SERVICE_NAME"

Write-Host "🚀 Building TalentSecure Backend with latest fixes..." -ForegroundColor Green

# Get current commit SHA
$COMMIT_SHA = git rev-parse HEAD
Write-Host "📝 Current commit: $COMMIT_SHA" -ForegroundColor Cyan

# Navigate to backend directory
Set-Location $PSScriptRoot

Write-Host "🐳 Building Docker image..." -ForegroundColor Yellow
docker build -t "${IMAGE_PATH}:${COMMIT_SHA}" -t "${IMAGE_PATH}:latest" .

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Docker build successful!" -ForegroundColor Green

Write-Host "📤 Pushing to Artifact Registry..." -ForegroundColor Yellow
docker push "${IMAGE_PATH}:${COMMIT_SHA}"
docker push "${IMAGE_PATH}:latest"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker push failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Images pushed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Image tags:" -ForegroundColor Cyan
Write-Host "   - ${IMAGE_PATH}:${COMMIT_SHA}"
Write-Host "   - ${IMAGE_PATH}:latest"
Write-Host ""
Write-Host "🚢 To deploy this image, go to Cloud Run console and use:" -ForegroundColor Yellow
Write-Host "   ${IMAGE_PATH}:${COMMIT_SHA}" -ForegroundColor White
Write-Host ""
Write-Host "Or run this command:" -ForegroundColor Yellow
Write-Host "   gcloud run deploy $SERVICE_NAME --image ${IMAGE_PATH}:${COMMIT_SHA} --region $REGION" -ForegroundColor White
