import React, { useState, useRef } from 'react';
import {
  Box,
  Button,
  Typography,
  LinearProgress,
  Alert,
  Paper,
  IconButton,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  VideoFile as VideoIcon,
} from '@mui/icons-material';

interface VideoUploadProps {
  candidateId: string;
  currentVideoPath?: string | null;
  onUploadSuccess?: () => void;
  onDeleteSuccess?: () => void;
}

import { candidateService } from '../../services/candidate.service';

const VideoUpload: React.FC<VideoUploadProps> = ({
  candidateId,
  currentVideoPath,
  onUploadSuccess,
  onDeleteSuccess,
}) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    if (!validTypes.includes(file.type)) {
      setError('Format de fichier non supporté. Utilisez MP4, MOV, AVI ou WebM.');
      return;
    }

    // Validate file size (500MB max)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('Le fichier est trop volumineux. Taille maximale : 500 MB.');
      return;
    }

    setSelectedFile(file);
    setError(null);
    setSuccess(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Veuillez sélectionner un fichier.');
      return;
    }

    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      // 1. Try to initiate direct upload
      let directUploadData;
      try {
        const initResponse = await candidateService.initiateVideoUpload(
          candidateId,
          selectedFile.name,
          selectedFile.type
        );
        directUploadData = initResponse.data;
      } catch (err: any) {
        // If direct upload is not supported or failed, fallback to legacy upload
        console.warn('Direct upload init failed, falling back to multipart:', err);
        if (err.response?.data?.error === 'DIRECT_UPLOAD_NOT_SUPPORTED') {
          throw new Error("L'upload direct n'est pas supporté. Veuillez contacter l'administrateur.");
        }
        // If it's another error, we might want to try legacy or just fail.
        // For now, let's try legacy if it looks like a 404/500 on that endpoint, 
        // but since I just added the endpoint, if it fails it's likely real error.
        throw err;
      }

      // 2. Upload directly to storage (R2/GCS)
      if (directUploadData?.signedUrl) {
        await candidateService.uploadFileToUrl(
          directUploadData.signedUrl,
          selectedFile,
          selectedFile.type,
          (percentPromise) => setProgress(percentPromise)
        );

        // 3. Complete upload
        await candidateService.completeVideoUpload(candidateId, directUploadData.key);
      } else {
        // Fallback logic if needed, but for now we expect signedUrl
        throw new Error("Configuration d'upload invalide");
      }

      setSuccess(`Vidéo uploadée avec succès!`);
      setSelectedFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (onUploadSuccess) {
        setTimeout(onUploadSuccess, 1000);
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || "Erreur lors de l'upload de la vidéo");
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 2000);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette vidéo ?')) {
      return;
    }

    setUploading(true);
    setError(null);

    try {
      await candidateService.deleteVideo(candidateId);

      setSuccess('Vidéo supprimée avec succès!');

      if (onDeleteSuccess) {
        setTimeout(onDeleteSuccess, 1000);
      }
    } catch (err: any) {
      console.error('Delete error:', err);
      setError(err.message || "Erreur lors de la suppression de la vidéo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Paper elevation={2} sx={{ p: 3, mt: 2 }}>
      <Box display="flex" alignItems="center" gap={1} mb={2}>
        <VideoIcon color="primary" />
        <Typography variant="h6">
          Vidéo d'entretien
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {currentVideoPath && !success?.includes('supprimée') && (
        <Box mb={2}>
          <Alert
            severity="info"
            action={
              <IconButton
                color="inherit"
                size="small"
                onClick={handleDelete}
                disabled={uploading}
              >
                <DeleteIcon />
              </IconButton>
            }
          >
            Une vidéo est déjà associée à ce candidat
          </Alert>
        </Box>
      )}

      <Box>
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
          onChange={handleFileSelect}
          ref={fileInputRef}
          style={{ display: 'none' }}
          id="video-upload-input"
        />

        <label htmlFor="video-upload-input">
          <Button
            variant="outlined"
            component="span"
            startIcon={<UploadIcon />}
            disabled={uploading}
            fullWidth
          >
            Sélectionner une vidéo
          </Button>
        </label>

        {selectedFile && (
          <Box mt={2}>
            <Typography variant="body2" color="text.secondary">
              Fichier sélectionné : {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
            </Typography>

            <Button
              variant="contained"
              color="primary"
              onClick={handleUpload}
              disabled={uploading}
              fullWidth
              sx={{ mt: 2 }}
              startIcon={<UploadIcon />}
            >
              {uploading ? 'Upload en cours...' : 'Uploader la vidéo'}
            </Button>
          </Box>
        )}

        {uploading && progress > 0 && (
          <Box mt={2}>
            <LinearProgress variant="determinate" value={progress} />
            <Typography variant="caption" color="text.secondary" textAlign="center" display="block" mt={0.5}>
              {progress}%
            </Typography>
          </Box>
        )}
      </Box>

      <Typography variant="caption" color="text.secondary" display="block" mt={2}>
        Formats acceptés : MP4, MOV, AVI, WebM • Taille maximale : 500 MB
      </Typography>
    </Paper>
  );
};

export default VideoUpload;
