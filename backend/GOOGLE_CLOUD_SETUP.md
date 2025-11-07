# Google Cloud Storage (GCS) Setup Guide

This guide will help you set up Google Cloud Storage for TalentSecure in production.

## Prerequisites

- Google Cloud Platform account
- GCloud CLI installed (optional but recommended)
- Admin access to create GCP resources

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on "Select a project" dropdown at the top
3. Click "NEW PROJECT"
4. Enter project name: `talentsecure-production` (or your preferred name)
5. Click "CREATE"
6. Note your **Project ID** (you'll need this later)

## Step 2: Enable Required APIs

1. Go to **APIs & Services** > **Library**
2. Search for and enable:
   - **Cloud Storage API**
   - **Cloud Storage JSON API**

## Step 3: Create Storage Buckets

You need to create 3 buckets for different file types:

### Using Google Cloud Console:

1. Go to **Cloud Storage** > **Buckets**
2. Click **CREATE BUCKET**

#### Bucket 1: Videos
- **Name**: `talentsecure-videos` (must be globally unique)
- **Location type**: Region
- **Location**: Choose closest to your users (e.g., `northamerica-northeast1` for Montreal)
- **Storage class**: Standard
- **Access control**: Uniform
- **Protection tools**: Leave default
- Click **CREATE**

#### Bucket 2: CVs
- **Name**: `talentsecure-cvs`
- Same settings as above
- Click **CREATE**

#### Bucket 3: Catalogues
- **Name**: `talentsecure-catalogues`
- Same settings as above
- Click **CREATE**

### Using gcloud CLI (Alternative):

```bash
# Set your project
gcloud config set project YOUR_PROJECT_ID

# Create buckets
gsutil mb -l northamerica-northeast1 gs://talentsecure-videos
gsutil mb -l northamerica-northeast1 gs://talentsecure-cvs
gsutil mb -l northamerica-northeast1 gs://talentsecure-catalogues

# Set lifecycle (optional - delete videos after 2 years)
gsutil lifecycle set lifecycle-config.json gs://talentsecure-videos
```

## Step 4: Set Bucket Permissions

For each bucket, set proper CORS configuration:

1. Click on the bucket name
2. Go to **Permissions** tab
3. Ensure uniform access control is enabled

### CORS Configuration (if needed for direct browser uploads):

```json
[
  {
    "origin": ["https://your-domain.com"],
    "method": ["GET", "POST", "PUT", "DELETE"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

Apply CORS using gcloud:
```bash
gsutil cors set cors-config.json gs://talentsecure-videos
gsutil cors set cors-config.json gs://talentsecure-cvs
gsutil cors set cors-config.json gs://talentsecure-catalogues
```

## Step 5: Create Service Account

1. Go to **IAM & Admin** > **Service Accounts**
2. Click **CREATE SERVICE ACCOUNT**
3. Service account details:
   - **Name**: `talentsecure-storage`
   - **Description**: "Service account for TalentSecure file storage"
   - Click **CREATE AND CONTINUE**
4. Grant roles:
   - **Storage Object Admin** (for full bucket access)
   - Click **CONTINUE**
5. Click **DONE**

## Step 6: Create Service Account Key

1. Click on the service account you just created
2. Go to **KEYS** tab
3. Click **ADD KEY** > **Create new key**
4. Select **JSON** format
5. Click **CREATE**
6. **IMPORTANT**: Save this file securely as `gcs-credentials.json`

## Step 7: Configure Your Application

### Update .env file:

```env
# Google Cloud Storage
GCS_PROJECT_ID=your-project-id-here
GCS_CREDENTIALS_PATH=./gcs-credentials.json

# Enable GCS (set to true for production)
USE_GCS=true

# Bucket names (use your actual bucket names if different)
GCS_VIDEO_BUCKET=talentsecure-videos
GCS_CV_BUCKET=talentsecure-cvs
GCS_CATALOGUE_BUCKET=talentsecure-catalogues
```

### Place credentials file:

1. Copy `gcs-credentials.json` to your backend directory
2. **CRITICAL**: Add `gcs-credentials.json` to `.gitignore`
3. Never commit credentials to version control

## Step 8: Test the Configuration

Run this test script to verify your setup:

```bash
cd backend
npm run test:gcs
```

Or manually test by uploading a file through your application.

## Step 9: Security Best Practices

### ⚠️ IMPORTANT Security Steps:

1. **Never commit credentials to Git**:
   ```bash
   echo "gcs-credentials.json" >> .gitignore
   ```

2. **Rotate service account keys** every 90 days:
   - Create new key
   - Update production environment
   - Delete old key

3. **Use environment-specific service accounts**:
   - Development: `talentsecure-dev@...`
   - Staging: `talentsecure-staging@...`
   - Production: `talentsecure-prod@...`

4. **Enable bucket versioning** (for accidental deletions):
   ```bash
   gsutil versioning set on gs://talentsecure-videos
   gsutil versioning set on gs://talentsecure-cvs
   gsutil versioning set on gs://talentsecure-catalogues
   ```

5. **Set up lifecycle policies** to manage costs:
   - Archive old videos after 1 year
   - Delete videos after 2 years (if legal requirements allow)

Example lifecycle config (`lifecycle-config.json`):
```json
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "SetStorageClass", "storageClass": "NEARLINE"},
        "condition": {"age": 365}
      },
      {
        "action": {"type": "Delete"},
        "condition": {"age": 730}
      }
    ]
  }
}
```

## Step 10: Monitoring and Costs

### Set up budget alerts:

1. Go to **Billing** > **Budgets & alerts**
2. Click **CREATE BUDGET**
3. Set budget amount (e.g., $50/month)
4. Set alert thresholds (50%, 80%, 100%)
5. Add email notifications

### Monitor usage:

- Go to **Cloud Storage** > **Dashboard**
- Check storage usage, bandwidth, operations
- Typical costs:
  - Storage: ~$0.02/GB/month (Standard)
  - Egress: ~$0.12/GB (North America)
  - Operations: ~$0.004 per 10,000 operations

## Troubleshooting

### Error: "The caller does not have permission"
- Check service account has `Storage Object Admin` role
- Verify credentials file is correct
- Ensure `GCS_PROJECT_ID` matches your project

### Error: "Bucket not found"
- Verify bucket names in `.env` match actual bucket names
- Check buckets are in the same project as service account
- Ensure buckets are created in the correct project

### Error: "403 Forbidden"
- Check CORS configuration if uploading from browser
- Verify service account permissions
- Check bucket IAM policies

### Files upload but can't download:
- Check signed URL expiration time
- Verify service account has `storage.objects.get` permission
- Check firewall rules if using VPC

## Local Development

For local development, keep `USE_GCS=false` to use local file storage.

Files will be stored in:
- Videos: `backend/uploads/videos/`
- CVs: `backend/uploads/cvs/`
- Catalogues: `backend/uploads/catalogues/`

## Production Checklist

Before going live, verify:

- [x] All 3 buckets created
- [x] Service account created with proper roles
- [x] Credentials file downloaded and secured
- [x] `.env` configured with correct values
- [x] `USE_GCS=true` in production
- [x] Credentials file NOT in version control
- [x] CORS configured (if needed)
- [x] Budget alerts set up
- [x] Lifecycle policies configured
- [x] Versioning enabled
- [x] Test upload/download working

## Support

For issues with Google Cloud:
- [GCS Documentation](https://cloud.google.com/storage/docs)
- [Node.js Client Library](https://cloud.google.com/nodejs/docs/reference/storage/latest)
- [GCP Support](https://cloud.google.com/support)

For TalentSecure-specific issues:
- Check application logs in `backend/logs/`
- Review error messages in Winston logs
- Contact your development team
