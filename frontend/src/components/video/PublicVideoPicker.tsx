import { useRef, useState } from 'react';
import { Box, Button, LinearProgress, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import { CloudUpload as UploadIcon } from '@mui/icons-material';
import VideoRecorder from '@/components/video/VideoRecorder';

/**
 * Choix de la vidéo sur les pages publiques (/ma-video et /video) : téléverser
 * un fichier, ou s'enregistrer depuis le navigateur. La page garde l'envoi ;
 * ce composant ne fait que livrer le fichier choisi.
 */

const ACCEPTED_EXTENSIONS = 'video/mp4,video/quicktime,video/webm,video/x-matroska,video/3gpp';

export const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} Mo`;

interface PublicVideoPickerProps {
  maxBytes: number;
  uploading: boolean;
  progress: number;
  onSend: (blob: Blob, filename: string) => Promise<void> | void;
  /**
   * Onglet « Enregistrer maintenant » en premier et ouvert d'office. Pour les
   * liens envoyés à froid : rares sont les candidats qui ont déjà une vidéo
   * d'eux sous la main. Si la caméra est indisponible, on bascule quand même
   * sur le fichier (onUnavailable).
   */
  recordFirst?: boolean;
}

export default function PublicVideoPicker({
  maxBytes,
  uploading,
  progress,
  onSend,
  recordFirst = false,
}: PublicVideoPickerProps) {
  const [tab, setTab] = useState<'file' | 'record'>(recordFirst ? 'record' : 'file');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await onSend(file, file.name);
    // Permet de rechoisir le même fichier après une erreur.
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Paper elevation={2} sx={{ overflow: 'hidden' }}>
      <Tabs
        value={tab}
        onChange={(_, value) => setTab(value)}
        variant="fullWidth"
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        {recordFirst && <Tab value="record" label="Enregistrer maintenant" disabled={uploading} />}
        <Tab value="file" label="Téléverser un fichier" disabled={uploading} />
        {!recordFirst && <Tab value="record" label="Enregistrer maintenant" disabled={uploading} />}
      </Tabs>

      <Box sx={{ p: 3 }}>
        {tab === 'file' && (
          <Stack spacing={2}>
            <input
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileSelect}
              ref={fileInputRef}
              style={{ display: 'none' }}
              id="public-video-input"
              data-testid="public-video-input"
            />
            <label htmlFor="public-video-input">
              <Button
                variant="contained"
                component="span"
                size="large"
                startIcon={<UploadIcon />}
                disabled={uploading}
                fullWidth
              >
                Choisir ma vidéo
              </Button>
            </label>
            <Typography variant="caption" color="text.secondary">
              MP4, MOV, WebM — jusqu'à {formatMb(maxBytes)}. Si votre vidéo est plus lourde,
              utilisez plutôt l'onglet « Enregistrer maintenant ».
            </Typography>
          </Stack>
        )}

        {tab === 'record' && (
          <VideoRecorder
            onRecorded={(blob, filename) => void onSend(blob, filename)}
            onUnavailable={() => setTab('file')}
            disabled={uploading}
          />
        )}

        {uploading && (
          <Box mt={3}>
            <LinearProgress variant="determinate" value={progress} />
            <Typography variant="caption" color="text.secondary" display="block" mt={1}>
              Envoi en cours — {progress} %. Gardez cette page ouverte.
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
