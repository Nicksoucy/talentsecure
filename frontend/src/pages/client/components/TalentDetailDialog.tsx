import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  Divider,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Star as StarIcon,
  LocationOn as LocationIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  ShoppingCart as CartIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { talentMarketplaceService } from '@/services/talent-marketplace.service';
import CandidateMarketplaceVideoPlayer from './CandidateMarketplaceVideoPlayer';

interface Props {
  candidateId: string | null;
  onClose: () => void;
}

/**
 * Détail d'un candidat côté client : note dédiée + vidéo + ville.
 * Pas de CV ni d'adresse complète. Achat Stripe → après achat, coordonnées.
 */
export default function TalentDetailDialog({ candidateId, onClose }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const [buying, setBuying] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['talent-detail', candidateId],
    queryFn: () => talentMarketplaceService.getTalentDetail(candidateId!),
    enabled: !!candidateId,
  });

  const t = data?.data;

  const handleBuy = async () => {
    if (!candidateId) return;
    setBuying(true);
    try {
      const { url } = await talentMarketplaceService.checkout(candidateId);
      window.location.href = url; // redirection Stripe
    } catch (e: any) {
      enqueueSnackbar(e.response?.data?.error || 'Paiement indisponible', { variant: 'error' });
      setBuying(false);
    }
  };

  return (
    <Dialog open={!!candidateId} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {t ? `${t.firstName}${t.purchased && t.lastName ? ' ' + t.lastName : ' ••••'}` : 'Candidat'}
      </DialogTitle>
      <DialogContent dividers>
        {isLoading || !t ? (
          <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip icon={<LocationIcon />} label={`${t.city || ''}${t.province ? ', ' + t.province : ''}`} />
              {typeof t.globalRating === 'number' && t.globalRating > 0 && (
                <Chip icon={<StarIcon />} color="warning" label={`${t.globalRating}/10`} />
              )}
              {t.hasBSP && <Chip label="BSP" color="success" size="small" />}
              {t.hasVehicle && <Chip label="Véhicule" size="small" />}
              {t.available24_7 && <Chip label="24/7" size="small" />}
            </Box>

            {/* Note dédiée client */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Note de l'équipe</Typography>
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                {t.clientNote || 'Aucune note pour le moment.'}
              </Typography>
            </Box>

            {/* Vidéo de présentation */}
            {t.hasVideo && (
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Vidéo de présentation
                </Typography>
                <CandidateMarketplaceVideoPlayer candidateId={t.id} />
              </Box>
            )}

            {/* Expériences */}
            {t.experiences?.length > 0 && (
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Expérience</Typography>
                {t.experiences.map((e, i) => (
                  <Typography key={i} variant="body2">
                    • {e.position}{e.companyName ? ` — ${e.companyName}` : ''}
                  </Typography>
                ))}
              </Box>
            )}

            <Divider />

            {/* Coordonnées après achat */}
            {t.purchased ? (
              <Alert severity="success" icon={<CartIcon />}>
                <Typography variant="subtitle2">Candidat acheté — coordonnées :</Typography>
                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Typography variant="body2">{t.firstName} {t.lastName}</Typography>
                  {t.phone && <Typography variant="body2"><PhoneIcon fontSize="inherit" /> {t.phone}</Typography>}
                  {t.email && <Typography variant="body2"><EmailIcon fontSize="inherit" /> {t.email}</Typography>}
                </Box>
              </Alert>
            ) : (
              <Alert severity="info">
                Achetez ce candidat pour obtenir ses coordonnées et organiser le placement.
                Le CV et l'adresse complète ne sont pas communiqués.
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Fermer</Button>
        {t && !t.purchased && (
          <Button variant="contained" startIcon={<CartIcon />} onClick={handleBuy} disabled={buying}>
            {buying ? 'Redirection…' : 'Acheter ce candidat'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
