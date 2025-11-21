import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Google Drive Service for Video Storage
 *
 * This service provides free video storage using Google Drive.
 * Videos are uploaded to a Google Drive account and shared with public links.
 *
 * Benefits:
 * - 15 GB free storage per Google account
 * - No cost for bandwidth
 * - Easy to manage via Google Drive interface
 */

// Google Drive API configuration
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Get credentials from environment variables
const CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_DRIVE_REDIRECT_URI || 'http://localhost:5000/auth/google/callback';
const REFRESH_TOKEN = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID; // Optional: Organize videos in a specific folder

// Flag to enable/disable Google Drive
export const useGoogleDrive = process.env.USE_GOOGLE_DRIVE === 'true';

/**
 * Initialize OAuth2 client
 */
function getOAuth2Client() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Google Drive credentials not configured. Please set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET');
  }

  const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
  );

  if (REFRESH_TOKEN) {
    oauth2Client.setCredentials({
      refresh_token: REFRESH_TOKEN,
    });
  }

  return oauth2Client;
}

/**
 * Upload a video file to Google Drive
 *
 * @param filePath - Local path to the video file
 * @param fileName - Name to give the file in Google Drive
 * @returns Object with fileId and webViewLink
 */
export async function uploadVideoToDrive(
  filePath: string,
  fileName: string
): Promise<{ fileId: string; webViewLink: string; webContentLink: string }> {
  try {
    const auth = getOAuth2Client();
    const drive = google.drive({ version: 'v3', auth });

    // File metadata
    const fileMetadata: any = {
      name: fileName,
      mimeType: 'video/mp4',
    };

    // If folder ID is specified, upload to that folder
    if (FOLDER_ID) {
      fileMetadata.parents = [FOLDER_ID];
    }

    // Upload file
    const media = {
      mimeType: 'video/mp4',
      body: fs.createReadStream(filePath),
    };

    console.log(`Uploading video to Google Drive: ${fileName}`);

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink',
    });

    const fileId = response.data.id!;

    // Make the file publicly accessible (anyone with the link can view)
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    console.log(`Video uploaded successfully. File ID: ${fileId}`);

    return {
      fileId: fileId,
      webViewLink: response.data.webViewLink!,
      webContentLink: response.data.webContentLink!,
    };
  } catch (error: any) {
    console.error('Error uploading to Google Drive:', error.message);
    throw new Error(`Failed to upload video to Google Drive: ${error.message}`);
  }
}

/**
 * Delete a video from Google Drive
 *
 * @param fileId - The Google Drive file ID
 */
export async function deleteVideoFromDrive(fileId: string): Promise<void> {
  try {
    const auth = getOAuth2Client();
    const drive = google.drive({ version: 'v3', auth });

    await drive.files.delete({
      fileId: fileId,
    });

    console.log(`Video deleted from Google Drive. File ID: ${fileId}`);
  } catch (error: any) {
    console.error('Error deleting from Google Drive:', error.message);
    throw new Error(`Failed to delete video from Google Drive: ${error.message}`);
  }
}

/**
 * Get video metadata from Google Drive
 *
 * @param fileId - The Google Drive file ID
 * @returns File metadata including name, size, and links
 */
export async function getVideoMetadata(fileId: string): Promise<any> {
  try {
    const auth = getOAuth2Client();
    const drive = google.drive({ version: 'v3', auth });

    const response = await drive.files.get({
      fileId: fileId,
      fields: 'id, name, size, mimeType, webViewLink, webContentLink, createdTime',
    });

    return response.data;
  } catch (error: any) {
    console.error('Error getting video metadata:', error.message);
    throw new Error(`Failed to get video metadata: ${error.message}`);
  }
}

/**
 * Generate authorization URL for first-time setup
 * This is needed to get the refresh token
 */
export function generateAuthUrl(): string {
  const oauth2Client = getOAuth2Client();

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to get refresh token
  });

  return authUrl;
}

/**
 * Exchange authorization code for tokens
 * This is used during initial setup to get the refresh token
 */
export async function getTokensFromCode(code: string): Promise<any> {
  const oauth2Client = getOAuth2Client();

  const { tokens } = await oauth2Client.getToken(code);

  return tokens;
}

/**
 * Get embeddable video URL for video tag
 * Google Drive preview URLs don't work in iframes due to CSP restrictions
 * Instead, we use the direct download URL which works in <video> tags
 */
export function getEmbedUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Get direct download URL
 */
export function getDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}
