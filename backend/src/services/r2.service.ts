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
import * as fs from 'fs';
import * as path from 'path';

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
    forcePathStyle: true, // Crucial for proxy compatibility (keeps bucket in path)
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
 * Generate a signed URL for uploading a video (PUT)
 *
 * @param fileName - The filename
 * @param contentType - The MIME type
 * @param expiresIn - Expiration time in seconds (default: 3600)
 * @returns Object with signedUrl and key
 */
export async function getUploadSignedVideoUrl(
  fileName: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<{ signedUrl: string; key: string }> {
  try {
    const client = getR2Client();

    // Generate a unique key
    const timestamp = Date.now();
    const key = `videos/candidates/${timestamp}_${fileName}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      // Default headers for video streaming optimization
      CacheControl: 'public, max-age=31536000',
    });

    const signedUrl = await getSignedUrl(client, command, {
      expiresIn: expiresIn,
    });

    return { signedUrl, key };
  } catch (error: any) {
    console.error('Error generating upload signed URL:', error.message);
    throw new Error(`Failed to generate upload signed URL: ${error.message}`);
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
 * Upload d'un Buffer (en mémoire) vers R2 — pour les fichiers téléchargés
 * depuis GHL sans passer par le disque.
 *
 * @param buffer - Contenu du fichier
 * @param key - Clé R2 (ex: "videos/prospects/<id>_<nom>.mp4")
 * @param contentType - MIME type
 * @returns La clé R2 et l'URL publique
 */
export async function uploadBufferToR2(
  buffer: Buffer,
  key: string,
  contentType: string = 'application/octet-stream'
): Promise<{ key: string; url: string }> {
  try {
    const client = getR2Client();
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        // inline pour permettre la lecture vidéo/PDF dans le navigateur
        ContentDisposition: 'inline',
        CacheControl: 'public, max-age=31536000',
      })
    );
    return { key, url: getPublicUrl(key) };
  } catch (error: any) {
    console.error('Error uploading buffer to R2:', error.message);
    throw new Error(`Failed to upload buffer to R2: ${error.message}`);
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
 * URL présignée PUT pour un téléversement depuis un client NON authentifié
 * (page publique /ma-video).
 *
 * Différences avec `getUploadSignedVideoUrl`, qui reste réservé au staff :
 *  - la clé est imposée par l'appelant (pas de préfixe codé en dur) ;
 *  - `ContentType` ET `ContentLength` sont figés dans la signature : R2 rejette
 *    tout corps dont le type ou la taille diffère de ce que le serveur a
 *    autorisé. Sans ça, une URL présignée publique est une porte ouverte pour
 *    déverser n'importe quoi, de n'importe quelle taille, dans le bucket ;
 *  - TTL court par défaut (15 min) — largement suffisant pour démarrer un
 *    téléversement, et la fenêtre d'abus reste petite.
 */
export async function getConstrainedUploadUrl(params: {
  key: string;
  contentType: string;
  exactBytes: number;
  expiresIn?: number;
}): Promise<string> {
  const { key, contentType, exactBytes, expiresIn = 900 } = params;
  try {
    const client = getR2Client();

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      ContentLength: exactBytes,
      // inline : la vidéo doit se lire dans le navigateur, pas se télécharger
      ContentDisposition: 'inline',
      CacheControl: 'public, max-age=31536000',
    });

    return await getSignedUrl(client, command, {
      expiresIn,
      // Sans cette liste, le SDK ne signe pas content-length et la contrainte
      // de taille devient purement décorative.
      signableHeaders: new Set(['content-type', 'content-length']),
    });
  } catch (error: any) {
    console.error('Error generating constrained upload URL:', error.message);
    throw new Error(`Failed to generate constrained upload URL: ${error.message}`);
  }
}

/**
 * Métadonnées d'un objet R2, ou null s'il n'existe pas.
 * Sert à vérifier qu'un téléversement présigné a réellement abouti.
 */
export async function headObjectInR2(
  key: string
): Promise<{ contentLength: number; contentType?: string } | null> {
  try {
    const client = getR2Client();
    const res = await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    return {
      contentLength: res.ContentLength ?? 0,
      contentType: res.ContentType,
    };
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

/**
 * Lit les `bytes` premiers octets d'un objet R2 (requête Range).
 *
 * Utilisé pour valider les magic bytes d'un fichier téléversé sans jamais
 * rapatrier 500 Mo dans la mémoire de Cloud Run.
 */
export async function readObjectPrefix(key: string, bytes: number = 4096): Promise<Buffer | null> {
  try {
    const client = getR2Client();
    const res = await client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Range: `bytes=0-${Math.max(0, bytes - 1)}`,
      })
    );
    if (!res.Body) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null;
    throw error;
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
