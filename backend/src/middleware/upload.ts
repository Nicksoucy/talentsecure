import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';

// Créer le dossier uploads s'il n'existe pas
const uploadsDir = path.join(__dirname, '../../uploads');
const cvDir = path.join(uploadsDir, 'cvs');
const documentsDir = path.join(uploadsDir, 'documents');

[uploadsDir, cvDir, documentsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configuration du stockage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Déterminer le dossier de destination selon le type
    const uploadType = req.params.type || 'documents';
    const dest = uploadType === 'cv' ? cvDir : documentsDir;
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    // Générer un nom unique: candidateId_timestamp_originalname
    const candidateId = req.params.id;
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const nameWithoutExt = path.basename(file.originalname, ext);
    const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${candidateId}_${timestamp}_${sanitizedName}${ext}`);
  },
});

// Filtrer les types de fichiers acceptés
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorisé. Seuls les PDF, DOC, DOCX, JPG et PNG sont acceptés.'));
  }
};

// Middleware multer
export const uploadCV = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
  },
}).single('cv');

export const uploadDocument = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
  },
}).single('document');

// Helper pour supprimer un fichier
export const deleteFile = (filePath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};
