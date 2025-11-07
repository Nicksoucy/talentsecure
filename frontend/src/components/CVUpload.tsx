import { useState, useRef } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  IconButton,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Description as FileIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { uploadService } from '@/services/upload.service';

interface CVUploadProps {
  candidateId: string;
  currentCV?: {
    cvUrl: string | null;
    cvStoragePath: string | null;
  };
}

export default function CVUpload({ candidateId, currentCV }: CVUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadService.uploadCV(candidateId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidateId] });
      enqueueSnackbar('CV uploadé avec succès !', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error || 'Erreur lors de l\'upload du CV',
        { variant: 'error' }
      );
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => uploadService.deleteCV(candidateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidateId] });
      enqueueSnackbar('CV supprimé avec succès !', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error || 'Erreur lors de la suppression du CV',
        { variant: 'error' }
      );
    },
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    // Vérifier le type de fichier
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTypes.includes(file.type)) {
      enqueueSnackbar('Type de fichier non autorisé. Seuls les PDF et DOC/DOCX sont acceptés.', {
        variant: 'error',
      });
      return;
    }

    // Vérifier la taille (10 MB max)
    if (file.size > 10 * 1024 * 1024) {
      enqueueSnackbar('Le fichier est trop volumineux. Taille maximum: 10 MB', {
        variant: 'error',
      });
      return;
    }

    uploadMutation.mutate(file);
  };

  const handleDownload = () => {
    const downloadUrl = uploadService.getCVDownloadUrl(candidateId);
    window.open(downloadUrl, '_blank');
  };

  const handleDelete = () => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce CV ?')) {
      deleteMutation.mutate();
    }
  };

  const hasCV = currentCV?.cvUrl || currentCV?.cvStoragePath;
  const isLoading = uploadMutation.isPending || deleteMutation.isPending;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Curriculum Vitae
        </Typography>

        {hasCV ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              p: 2,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              bgcolor: 'background.paper',
            }}
          >
            <FileIcon color="primary" fontSize="large" />
            <Box flex={1}>
              <Typography variant="body1" fontWeight="medium">
                CV disponible
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Cliquez sur télécharger pour voir le CV
              </Typography>
            </Box>
            <IconButton color="primary" onClick={handleDownload} disabled={isLoading}>
              <DownloadIcon />
            </IconButton>
            <IconButton color="error" onClick={handleDelete} disabled={isLoading}>
              {deleteMutation.isPending ? (
                <CircularProgress size={24} />
              ) : (
                <DeleteIcon />
              )}
            </IconButton>
          </Box>
        ) : (
          <Box
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            sx={{
              border: '2px dashed',
              borderColor: dragActive ? 'primary.main' : 'divider',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              bgcolor: dragActive ? 'action.hover' : 'background.paper',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileInput}
              style={{ display: 'none' }}
              disabled={isLoading}
            />
            {uploadMutation.isPending ? (
              <CircularProgress />
            ) : (
              <>
                <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                <Typography variant="body1" gutterBottom>
                  Glissez-déposez votre CV ici
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  ou
                </Typography>
                <Button variant="outlined" component="span">
                  Parcourir les fichiers
                </Button>
                <Typography variant="caption" display="block" color="text.secondary" mt={2}>
                  Formats acceptés: PDF, DOC, DOCX (max 10 MB)
                </Typography>
              </>
            )}
          </Box>
        )}

        {uploadMutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Une erreur est survenue lors de l'upload
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
