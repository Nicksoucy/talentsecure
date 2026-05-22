import React, { useState, useEffect } from 'react';
import { Box, CircularProgress, Alert, Typography } from '@mui/material';
import { prospectService } from '@/services/prospect.service';

interface ProspectVideoPlayerProps {
  prospectId: string;
  height?: number | string;
}

/**
 * Lecteur de la vidéo de présentation d'un prospect.
 * Récupère une URL signée R2 via /api/prospects/:id/video-url puis joue
 * la vidéo. Même pattern que le VideoPlayer des candidats.
 */
const ProspectVideoPlayer: React.FC<ProspectVideoPlayerProps> = ({ prospectId, height = 360 }) => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setVideoUrl(null);
    prospectService
      .getVideoUrl(prospectId)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data.videoUrl) setVideoUrl(res.data.videoUrl);
        else setError('Aucune vidéo disponible');
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err.response?.status === 404 ? 'Aucune vidéo disponible' : 'Erreur de chargement de la vidéo');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [prospectId]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" sx={{ height }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !videoUrl) {
    return <Alert severity="info">{error || 'Aucune vidéo disponible'}</Alert>;
  }

  return (
    <Box sx={{ width: '100%', borderRadius: 1, overflow: 'hidden', backgroundColor: '#000' }}>
      {/* Pas de type="video/mp4" codé en dur : le navigateur renifle le Content-Type */}
      <video
        src={videoUrl}
        controls
        preload="metadata"
        style={{ width: '100%', maxHeight: typeof height === 'number' ? `${height}px` : height, display: 'block' }}
      >
        <Typography>Votre navigateur ne supporte pas la lecture de vidéos.</Typography>
      </video>
    </Box>
  );
};

export default ProspectVideoPlayer;
