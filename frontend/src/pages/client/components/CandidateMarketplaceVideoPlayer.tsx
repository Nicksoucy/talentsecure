import React, { useState, useEffect } from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import { talentMarketplaceService } from '@/services/talent-marketplace.service';

/**
 * Lecteur de la vidéo de présentation d'un candidat, côté client.
 * Récupère une URL signée R2 via l'API marketplace puis joue la vidéo.
 */
const CandidateMarketplaceVideoPlayer: React.FC<{ candidateId: string }> = ({ candidateId }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUrl(null);
    talentMarketplaceService
      .getTalentVideoUrl(candidateId)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data.videoUrl) setUrl(res.data.videoUrl);
        else setError('Aucune vidéo disponible');
      })
      .catch(() => !cancelled && setError('Aucune vidéo disponible'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [candidateId]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" sx={{ height: 240 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error || !url) return <Alert severity="info">{error || 'Aucune vidéo'}</Alert>;

  return (
    <Box sx={{ width: '100%', borderRadius: 1, overflow: 'hidden', backgroundColor: '#000' }}>
      <video src={url} controls preload="metadata" style={{ width: '100%', maxHeight: 400, display: 'block' }} />
    </Box>
  );
};

export default CandidateMarketplaceVideoPlayer;
