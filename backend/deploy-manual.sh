#!/bin/bash
# Manual deployment script for TalentSecure Backend
# Use this when Cloud Build trigger is stuck on old commit

set -e

PROJECT_ID="talentsecure"
REGION="northamerica-northeast1"
SERVICE_NAME="talentsecure"
IMAGE_NAME="$REGION-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/$SERVICE_NAME/$SERVICE_NAME"

echo "🚀 Deploying TalentSecure Backend manually..."
echo "📦 Building Docker image with latest code..."

# Get current commit SHA
COMMIT_SHA=$(git rev-parse HEAD)
echo "📝 Current commit: $COMMIT_SHA"

# Build and tag the image
cd "$(dirname "$0")"
docker build -t "$IMAGE_NAME:$COMMIT_SHA" -t "$IMAGE_NAME:latest" .

echo "📤 Pushing image to Artifact Registry..."
docker push "$IMAGE_NAME:$COMMIT_SHA"
docker push "$IMAGE_NAME:latest"

echo "🚢 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image "$IMAGE_NAME:$COMMIT_SHA" \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 10 \
  --min-instances 0 \
  --timeout 300

echo "✅ Deployment complete!"
echo "🌐 Service URL:"
gcloud run services describe $SERVICE_NAME --region $REGION --format="value(status.url)"
