import { Storage } from '@google-cloud/storage';
import * as path from 'path';

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
 * Get a signed URL for uploading a file (PUT)
 */
export async function getUploadSignedUrl(
  bucketName: string,
  fileName: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<{ signedUrl: string; key: string }> {
  // For local development, we can't really do signed URLs easily without a real GCS bucket.
  // We'll rely on the existing multipart flow for local dev if not using GCS.
  // But since we want to unify, maybe we just return keys and handle local differently?
  // If useGCS is false, we should probably throw or handle it upstream.
  // However, video.service will handle the switch.

  if (!useGCS || !storage) {
    throw new Error('Direct upload not supported for local storage');
  }

  try {
    const bucket = storage.bucket(bucketName);
    // Unique filename logic should be handled by caller or here?
    // Let's assume caller gives us the final destination path or we construct it.
    // To match R2 behavior, we'll construct a unique path here if just a filename is given.

    // Actually, let's keep it simple: caller provides unique filename if needed, 
    // but here we just sign whatever is passed.
    // Wait, R2 service generates the key. Let's consistency.
    const timestamp = Date.now();
    const key = `videos/${timestamp}_${fileName}`;

    const file = bucket.file(key);

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + expiresIn * 1000,
      contentType: contentType,
    });

    return { signedUrl: url, key };
  } catch (error) {
    console.error('Error generating upload signed URL:', error);
    throw new Error('Failed to generate upload signed URL');
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
