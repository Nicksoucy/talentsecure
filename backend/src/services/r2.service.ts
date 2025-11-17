/**
 * Cloudflare R2 Service for Video Storage
 *
 * R2 is S3-compatible object storage with:
 * - 10 GB free storage
 * - FREE bandwidth (no egress fees!)
 * - Perfect for video streaming
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';

// R2 Configuration from environment variables
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'talentsecure-videos';
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // Optional: custom domain for public access

// Flag to enable/disable R2
export const useR2 = process.env.USE_R2 === 'true';

/**
 * Initialize R2 client (S3-compatible)
 */
function getR2Client(): S3Client {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 credentials not configured. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY');
  }

  // R2 endpoint format: https://<account-id>.r2.cloudflarestorage.com
  const endpoint = R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

  return new S3Client({
    region: 'auto', // R2 uses 'auto' region
    endpoint: endpoint,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Upload a video file to R2
 *
 * @param filePath - Local path to the video file
 * @param fileName - Name to give the file in R2
 * @returns The storage key (path in R2)
 */
export async function uploadVideoToR2(
  filePath: string,
  fileName: string
): Promise<{ key: string; url: string }> {
  try {
    const client = getR2Client();

    // Generate a unique key with prefix for organization
    const timestamp = Date.now();
    const key = `videos/candidates/${timestamp}_${fileName}`;

    // Read file
    const fileContent = fs.readFileSync(filePath);

    // Upload to R2
    console.log(`Uploading video to Cloudflare R2: ${key}`);

    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: fileContent,
        ContentType: 'video/mp4',
        // Make it accessible for streaming
        ContentDisposition: 'inline',
        CacheControl: 'public, max-age=31536000', // Cache for 1 year
      })
    );

    console.log(`Video uploaded successfully to R2. Key: ${key}`);

    // Generate public URL
    const url = getPublicUrl(key);

    return {
      key: key,
      url: url,
    };
  } catch (error: any) {
    console.error('Error uploading to R2:', error.message);
    throw new Error(`Failed to upload video to R2: ${error.message}`);
  }
}

/**
 * Delete a video from R2
 *
 * @param key - The R2 object key
 */
export async function deleteVideoFromR2(key: string): Promise<void> {
  try {
    const client = getR2Client();

    await client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      })
    );

    console.log(`Video deleted from R2. Key: ${key}`);
  } catch (error: any) {
    console.error('Error deleting from R2:', error.message);
    throw new Error(`Failed to delete video from R2: ${error.message}`);
  }
}

/**
 * Get video metadata from R2
 *
 * @param key - The R2 object key
 * @returns Metadata including size and content type
 */
export async function getVideoMetadata(key: string): Promise<any> {
  try {
    const client = getR2Client();

    const response = await client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      })
    );

    return {
      key: key,
      size: response.ContentLength,
      contentType: response.ContentType,
      lastModified: response.LastModified,
    };
  } catch (error: any) {
    console.error('Error getting video metadata from R2:', error.message);
    throw new Error(`Failed to get video metadata: ${error.message}`);
  }
}

/**
 * Generate a signed URL for temporary access
 * Use this when you don't have a public domain configured
 *
 * @param key - The R2 object key
 * @param expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns Signed URL
 */
export async function getSignedVideoUrl(key: string, expiresIn: number = 3600): Promise<string> {
  try {
    const client = getR2Client();

    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    // Generate signed URL (valid for specified time)
    const signedUrl = await getSignedUrl(client, command, {
      expiresIn: expiresIn,
    });

    return signedUrl;
  } catch (error: any) {
    console.error('Error generating signed URL:', error.message);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
}

/**
 * Get public URL for a video
 * If R2_PUBLIC_URL is configured (custom domain), use that
 * Otherwise, generate a signed URL
 *
 * @param key - The R2 object key
 * @returns Public URL or signed URL
 */
export function getPublicUrl(key: string): string {
  if (R2_PUBLIC_URL) {
    // If custom domain is configured, use it
    // Remove trailing slash from R2_PUBLIC_URL if present
    const baseUrl = R2_PUBLIC_URL.replace(/\/$/, '');
    return `${baseUrl}/${key}`;
  } else {
    // Return the key - we'll generate signed URLs on-demand
    // The controller will call getSignedVideoUrl when needed
    return key;
  }
}

/**
 * Check if a video exists in R2
 *
 * @param key - The R2 object key
 * @returns True if exists, false otherwise
 */
export async function videoExistsInR2(key: string): Promise<boolean> {
  try {
    const client = getR2Client();

    await client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      })
    );

    return true;
  } catch (error: any) {
    if (error.name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Generic file upload to R2 (for CVs, documents, etc.)
 *
 * @param filePath - Local path to the file
 * @param key - The R2 object key (e.g., "cvs/uuid_filename.pdf")
 * @param contentType - MIME type of the file
 * @returns The storage key and URL
 */
export async function uploadFileToR2(
  filePath: string,
  key: string,
  contentType: string = 'application/octet-stream'
): Promise<{ key: string; url: string }> {
  try {
    const client = getR2Client();

    // Read file
    const fileContent = fs.readFileSync(filePath);

    // Upload to R2
    console.log(`Uploading file to Cloudflare R2: ${key}`);

    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        ContentDisposition: contentType.startsWith('application/') ? 'attachment' : 'inline',
        CacheControl: 'public, max-age=31536000', // Cache for 1 year
      })
    );

    console.log(`File uploaded successfully to R2. Key: ${key}`);

    // Generate public URL
    const url = getPublicUrl(key);

    return {
      key: key,
      url: url,
    };
  } catch (error: any) {
    console.error('Error uploading file to R2:', error.message);
    throw new Error(`Failed to upload file to R2: ${error.message}`);
  }
}

/**
 * Generic file deletion from R2
 *
 * @param key - The R2 object key
 */
export async function deleteFileFromR2(key: string): Promise<void> {
  try {
    const client = getR2Client();

    await client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      })
    );

    console.log(`File deleted from R2. Key: ${key}`);
  } catch (error: any) {
    console.error('Error deleting file from R2:', error.message);
    throw new Error(`Failed to delete file from R2: ${error.message}`);
  }
}

/**
 * Generate a signed URL for any file type
 *
 * @param key - The R2 object key
 * @param expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns Signed URL
 */
export async function getSignedFileUrl(key: string, expiresIn: number = 3600): Promise<string> {
  try {
    const client = getR2Client();

    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    // Generate signed URL (valid for specified time)
    const signedUrl = await getSignedUrl(client, command, {
      expiresIn: expiresIn,
    });

    return signedUrl;
  } catch (error: any) {
    console.error('Error generating signed URL:', error.message);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
}
