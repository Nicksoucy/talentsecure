import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  uploadFileToR2,
  deleteFileFromR2,
  getSignedFileUrl,
  useR2,
} from './r2.service';

/**
 * Configuration Multer pour l'upload de CVs
 */

// Ensure the upload directory exists
const LOCAL_CV_PATH = path.join(__dirname, '../../uploads/cvs');
if (!fs.existsSync(LOCAL_CV_PATH)) {
  fs.mkdirSync(LOCAL_CV_PATH, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, LOCAL_CV_PATH);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: uuid_originalname
    const uniqueName = `${uuidv4()}_${file.originalname}`;
    cb(null, uniqueName);
  },
});

// File filter - only allow PDF and document files
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format de fichier non supporté. Formats acceptés: PDF, DOC, DOCX'));
  }
};

// Multer configuration
export const cvUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
  },
});

/**
 * Upload CV to R2 storage (if enabled) and return the storage path
 */
export async function processCVUpload(localFilePath: string, originalFilename: string): Promise<string> {
  const fileName = path.basename(localFilePath);

  if (useR2) {
    try {
      console.log('Uploading CV to Cloudflare R2...');

      // Upload to R2
      const r2Response = await uploadFileToR2(localFilePath, `cvs/${fileName}`, 'application/pdf');

      // Delete local file after successful upload
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }

      console.log(`CV uploaded to R2. Key: ${r2Response.key}`);

      // Return the R2 key
      return r2Response.key;
    } catch (error: any) {
      console.error('Error uploading CV to R2:', error);
      throw new Error(`Failed to upload CV to R2: ${error.message}`);
    }
  }

  // Local storage fallback
  return `uploads/cvs/${fileName}`;
}

/**
 * Delete CV from storage
 */
export async function deleteCV(cvStoragePath: string): Promise<void> {
  try {
    if (useR2) {
      // cvStoragePath is the R2 key
      await deleteFileFromR2(cvStoragePath);
      console.log(`CV deleted from R2. Key: ${cvStoragePath}`);
    } else {
      // Local storage
      const filePath = path.join(__dirname, '../../', cvStoragePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Local CV file ${filePath} deleted`);
      }
    }
  } catch (error: any) {
    console.error('Error deleting CV:', error);
    throw new Error(`Failed to delete CV: ${error.message}`);
  }
}

/**
 * Get signed URL for CV download (when using R2)
 */
export async function getCVSignedUrl(cvKey: string, expiresIn: number = 3600): Promise<string> {
  if (!useR2) {
    throw new Error('R2 is not enabled');
  }
  return await getSignedFileUrl(cvKey, expiresIn);
}

/**
 * Get CV file path for local download
 */
export function getLocalCVPath(cvStoragePath: string): string {
  return path.join(__dirname, '../../', cvStoragePath);
}
