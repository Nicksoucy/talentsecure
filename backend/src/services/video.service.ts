import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { uploadFile, deleteFile, GCS_VIDEO_BUCKET, LOCAL_VIDEO_PATH, useGCS } from '../config/storage';

/**
 * Multer configuration for video upload
 */

// Ensure the upload directory exists
if (!fs.existsSync(LOCAL_VIDEO_PATH)) {
  fs.mkdirSync(LOCAL_VIDEO_PATH, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, LOCAL_VIDEO_PATH);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: uuid_originalname
    const uniqueName = `${uuidv4()}_${file.originalname}`;
    cb(null, uniqueName);
  },
});

// File filter - only allow video files
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    'video/mp4',
    'video/mpeg',
    'video/quicktime', // .mov
    'video/x-msvideo', // .avi
    'video/webm',
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format de fichier non supporté. Formats acceptés: MP4, MOV, AVI, WebM'));
  }
};

// Multer configuration
export const videoUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB max
  },
});

/**
 * Upload video to cloud storage (if enabled) and return the storage path
 */
export async function processVideoUpload(localFilePath: string, originalFilename: string): Promise<string> {
  const fileName = path.basename(localFilePath);

  if (useGCS) {
    try {
      // Upload to Google Cloud Storage
      await uploadFile(GCS_VIDEO_BUCKET, localFilePath, fileName);

      // Delete local file after successful upload
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }

      console.log(`Video ${fileName} uploaded to GCS and local file deleted`);
    } catch (error) {
      console.error('Error uploading video to GCS:', error);
      throw new Error('Failed to upload video to cloud storage');
    }
  }

  // Return the storage path (filename)
  return fileName;
}

/**
 * Delete video from storage
 */
export async function deleteVideo(videoStoragePath: string): Promise<void> {
  try {
    await deleteFile(GCS_VIDEO_BUCKET, videoStoragePath);
    console.log(`Video ${videoStoragePath} deleted successfully`);
  } catch (error) {
    console.error('Error deleting video:', error);
    throw new Error('Failed to delete video');
  }
}

/**
 * Get video size in MB
 */
export function getVideoSizeInMB(filePath: string): number {
  const stats = fs.statSync(filePath);
  return stats.size / (1024 * 1024);
}
