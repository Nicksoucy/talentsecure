import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  IconButton,
} from '@mui/material';
import {
  PlayCircleOutline as PlayIcon,
  VideoFile as VideoIcon,
  ErrorOutline as ErrorIcon,
} from '@mui/icons-material';
import { candidateService } from '../../services/candidate.service';

interface VideoPlayerProps {
  candidateId: string;
  videoType?: 'PRESENTATION' | 'INTERVIEW' | 'OTHER';
  title?: string;
  candidateName?: string;
  uploadedAt?: string | null;
  showTitle?: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  candidateId,
  videoType = 'INTERVIEW',
  title = 'Vidéo',
  candidateName,
  uploadedAt = null,
  showTitle = true,
}) => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadVideo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId, videoType]);

  const loadVideo = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await candidateService.getVideoUrlByType(candidateId, videoType);

      if (response.success && response.data.videoUrl) {
        setVideoUrl(response.data.videoUrl);
      } else {
        setError('Aucune vidéo disponible');
      }
    } catch (err: any) {
      console.error('Error loading video:', err);

      if (err.response?.status === 404) {
        setError('Aucune vidéo disponible pour ce candidat');
      } else {
        setError('Erreur lors du chargement de la vidéo');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Paper elevation={2} sx={{ p: 3 }}>
        {showTitle && (
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <VideoIcon color="primary" />
            <Typography variant="h6">{title}</Typography>
          </Box>
        )}
        <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
          <CircularProgress />
        </Box>
      </Paper>
    );
  }

  if (error || !videoUrl) {
    return (
      <Paper elevation={2} sx={{ p: 3 }}>
        {showTitle && (
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <VideoIcon color="disabled" />
            <Typography variant="h6">{title}</Typography>
          </Box>
        )}
        <Alert
          severity="info"
          icon={<ErrorIcon />}
        >
          {error || 'Aucune vidéo disponible'}
        </Alert>
      </Paper>
    );
  }

  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      {showTitle && (
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <VideoIcon color="primary" />
          <Typography variant="h6">
            {title}
            {candidateName && ` - ${candidateName}`}
          </Typography>
        </Box>
      )}

      {uploadedAt && (
        <Typography variant="caption" color="text.secondary" display="block" mb={2}>
          Uploadée le {new Date(uploadedAt).toLocaleDateString('fr-CA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Typography>
      )}

      <Box
        sx={{
          position: 'relative',
          width: '100%',
          borderRadius: 1,
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        {/* No hardcoded type="video/mp4" — uploads accept .mp4/.webm/.mov etc.,
            and a wrong mime hint silently makes the browser skip the source.
            Pointing src directly at the <video> lets it sniff the response
            Content-Type and pick the right decoder. */}
        <video
          src={videoUrl}
          controls
          style={{
            width: '100%',
            maxHeight: '500px',
            display: 'block',
          }}
          preload="metadata"
        >
          Votre navigateur ne supporte pas la lecture de vidéos.
        </video>
      </Box>

      <Typography variant="caption" color="text.secondary" display="block" mt={2}>
        Utilisez les contrôles pour lire, mettre en pause ou ajuster le volume
      </Typography>
    </Paper>
  );
};

export default VideoPlayer;
