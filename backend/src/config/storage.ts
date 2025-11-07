import { Storage } from '@google-cloud/storage';
import path from 'path';

/**
 * Configuration Google Cloud Storage
 *
 * Pour le développement local, utilisez un dossier local.
 * Pour la production, utilisez Google Cloud Storage avec un service account.
 */

// Check if we're using Google Cloud Storage or local storage
const useGCS = process.env.USE_GCS === 'true';

let storage: Storage | null = null;

if (useGCS) {
  // Initialize Google Cloud Storage
  const keyFilePath = process.env.GCS_KEY_FILE_PATH;

  if (keyFilePath) {
    storage = new Storage({
      keyFilename: keyFilePath,
      projectId: process.env.GCS_PROJECT_ID,
    });
  } else {
    // In production with GCP, credentials are automatically loaded
    storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
    });
  }
}

// Bucket names
export const GCS_VIDEO_BUCKET = process.env.GCS_VIDEO_BUCKET || 'talentsecure-videos';
export const GCS_CV_BUCKET = process.env.GCS_CV_BUCKET || 'talentsecure-cvs';
export const GCS_CATALOGUE_BUCKET = process.env.GCS_CATALOGUE_BUCKET || 'talentsecure-catalogues';

// Local storage paths (fallback for development)
export const LOCAL_VIDEO_PATH = path.join(__dirname, '../../uploads/videos');
export const LOCAL_CV_PATH = path.join(__dirname, '../../uploads/cv');
export const LOCAL_CATALOGUE_PATH = path.join(__dirname, '../../uploads/catalogues');

export { storage, useGCS };

/**
 * Get a signed URL for a file (valid for 1 hour by default)
 */
export async function getSignedUrl(
  bucketName: string,
  fileName: string,
  expiresIn: number = 3600
): Promise<string> {
  if (!useGCS || !storage) {
    // For local development, return local URL
    return `/uploads/${bucketName.replace('talentsecure-', '')}/${fileName}`;
  }

  try {
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresIn * 1000,
    });

    return url;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    throw new Error('Failed to generate signed URL');
  }
}

/**
 * Upload a file to Google Cloud Storage or local storage
 */
export async function uploadFile(
  bucketName: string,
  localFilePath: string,
  destinationFileName: string
): Promise<string> {
  if (!useGCS || !storage) {
    // For local development, file is already in the right place
    // Just return the local path
    return destinationFileName;
  }

  try {
    const bucket = storage.bucket(bucketName);

    await bucket.upload(localFilePath, {
      destination: destinationFileName,
      metadata: {
        contentType: 'video/mp4', // Default, can be customized
      },
    });

    console.log(`File ${localFilePath} uploaded to ${bucketName}/${destinationFileName}`);
    return destinationFileName;
  } catch (error) {
    console.error('Error uploading file to GCS:', error);
    throw new Error('Failed to upload file to cloud storage');
  }
}

/**
 * Delete a file from Google Cloud Storage or local storage
 */
export async function deleteFile(
  bucketName: string,
  fileName: string
): Promise<void> {
  if (!useGCS || !storage) {
    // For local development, use fs to delete file
    const fs = require('fs');
    const filePath = path.join(__dirname, `../../uploads/${bucketName.replace('talentsecure-', '')}/${fileName}`);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Local file ${filePath} deleted`);
    }
    return;
  }

  try {
    const bucket = storage.bucket(bucketName);
    await bucket.file(fileName).delete();
    console.log(`File ${fileName} deleted from ${bucketName}`);
  } catch (error) {
    console.error('Error deleting file from GCS:', error);
    throw new Error('Failed to delete file from cloud storage');
  }
}
