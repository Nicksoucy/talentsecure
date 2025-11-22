import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  CircularProgress,
  Alert,
  Chip,
  Divider,
} from '@mui/material';
import {
  LocationOn as LocationIcon,
  Person as PersonIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';
import { useWishlistStore, CandidateType } from '@/store/wishlistStore';
import { useClientAuthStore } from '@/store/clientAuthStore';
import { useSnackbar } from 'notistack';

interface CitySelectDialogProps {
  open: boolean;
  onClose: () => void;
  city: string;
  province?: string;
}

const CitySelectDialog: React.FC<CitySelectDialogProps> = ({
  open,
  onClose,
  city,
  province = 'QC',
}) => {
  const { accessToken } = useClientAuthStore();
  const { addItem, getCityPricing, getAvailableCount } = useWishlistStore();
  const { enqueueSnackbar } = useSnackbar();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [evaluatedQuantity, setEvaluatedQuantity] = useState(0);
  const [cvOnlyQuantity, setCvOnlyQuantity] = useState(0);
  const [notes, setNotes] = useState('');

  const [pricing, setPricing] = useState<any>(null);
  const [availability, setAvailability] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && accessToken) {
      loadData();
    }
  }, [open, city, accessToken]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pricingData, availabilityData] = await Promise.all([
        getCityPricing(accessToken!, city),
        getAvailableCount(accessToken!, city),
      ]);
      setPricing(pricingData);
      setAvailability(availabilityData);
    } catch (err: any) {
      setError('Erreur lors du chargement des données');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (evaluatedQuantity === 0 && cvOnlyQuantity === 0) {
      enqueueSnackbar('Veuillez sélectionner au moins un candidat', { variant: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      // Add evaluated candidates if selected
      if (evaluatedQuantity > 0) {
        await addItem(accessToken!, {
          city,
          province,
          type: 'EVALUATED',
          quantity: Number(evaluatedQuantity),
          notes,
        });
      }

      // Add CV-only candidates if selected
      if (cvOnlyQuantity > 0) {
        await addItem(accessToken!, {
          city,
          province,
          type: 'CV_ONLY',
          quantity: Number(cvOnlyQuantity),
          notes,
        });
      }

      enqueueSnackbar('Ajouté au panier avec succès!', { variant: 'success' });
      handleClose();
    } catch (error: any) {
      let errorMsg = error.response?.data?.message || error.response?.data?.error || 'Erreur lors de l\'ajout au panier';

      if (error.response?.data?.details && Array.isArray(error.response.data.details)) {
        const details = error.response.data.details.map((d: any) => `${d.field}: ${d.message}`).join(', ');
        errorMsg += ` (${details})`;
      }

      enqueueSnackbar(errorMsg, {
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setEvaluatedQuantity(0);
    setCvOnlyQuantity(0);
    setNotes('');
    setError(null);
    onClose();
  };

  const calculateTotal = () => {
    if (!pricing) return 0;
    const evaluatedTotal = evaluatedQuantity * Number(pricing.evaluatedCandidatePrice);
    const cvOnlyTotal = cvOnlyQuantity * Number(pricing.cvOnlyPrice);
    return evaluatedTotal + cvOnlyTotal;
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <LocationIcon color="primary" />
          <Typography variant="h6" fontWeight="bold">
            {city}, {province}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Sélectionnez la quantité de candidats que vous souhaitez demander pour cette ville.
            </Typography>

            {/* Evaluated Candidates */}
            <Box sx={{ mt: 3, p: 2, bgcolor: 'primary.50', borderRadius: 2 }}>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <PersonIcon color="primary" fontSize="small" />
                <Typography variant="subtitle2" fontWeight="bold" color="primary">
                  Candidats Évalués (Premium)
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                Déjà interviewés avec vidéo, notes RH et évaluations complètes
              </Typography>
              <Typography variant="body2" fontWeight="bold" color="success.main" mb={2}>
                {Number(pricing.evaluatedCandidatePrice).toFixed(2)}$ par candidat
              </Typography>
              <Typography variant="caption" display="block" color="text.secondary" mb={1}>
                Disponibles: {availability.evaluated}
              </Typography>
              <TextField
                type="number"
                label="Quantité"
                value={evaluatedQuantity}
                onChange={(e) => setEvaluatedQuantity(Math.max(0, Math.min(availability.evaluated, parseInt(e.target.value) || 0)))}
                fullWidth
                size="small"
                inputProps={{ min: 0, max: availability.evaluated }}
              />
            </Box>

            {/* CV Only */}
            <Box sx={{ mt: 2, p: 2, bgcolor: 'warning.50', borderRadius: 2 }}>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <DescriptionIcon color="warning" fontSize="small" />
                <Typography variant="subtitle2" fontWeight="bold" color="warning.main">
                  CVs Seulement (Économique)
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                CVs uniquement - Vous faites l'entrevue vous-même
              </Typography>
              <Typography variant="body2" fontWeight="bold" color="success.main" mb={2}>
                {Number(pricing.cvOnlyPrice).toFixed(2)}$ par CV
              </Typography>
              <Typography variant="caption" display="block" color="text.secondary" mb={1}>
                Disponibles: {availability.cvOnly}
              </Typography>
              <TextField
                type="number"
                label="Quantité"
                value={cvOnlyQuantity}
                onChange={(e) => setCvOnlyQuantity(Math.max(0, Math.min(availability.cvOnly, parseInt(e.target.value) || 0)))}
                fullWidth
                size="small"
                inputProps={{ min: 0, max: availability.cvOnly }}
              />
            </Box>

            {/* Notes */}
            <TextField
              label="Notes (optionnel)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
              multiline
              rows={2}
              size="small"
              placeholder="Ex: Recherche agents pour événement sportif..."
              sx={{ mt: 2 }}
            />

            {/* Total */}
            {(evaluatedQuantity > 0 || cvOnlyQuantity > 0) && (
              <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.100', borderRadius: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2" fontWeight="bold">
                    Total estimé
                  </Typography>
                  <Typography variant="h6" fontWeight="bold" color="primary">
                    {calculateTotal().toFixed(2)}$
                  </Typography>
                </Box>
                <Divider sx={{ my: 1 }} />
                {evaluatedQuantity > 0 && (
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                    <Typography variant="caption" color="text.secondary">
                      {evaluatedQuantity} candidat{evaluatedQuantity > 1 ? 's' : ''} évalué{evaluatedQuantity > 1 ? 's' : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {(evaluatedQuantity * Number(pricing.evaluatedCandidatePrice)).toFixed(2)}$
                    </Typography>
                  </Box>
                )}
                {cvOnlyQuantity > 0 && (
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                      {cvOnlyQuantity} CV{cvOnlyQuantity > 1 ? 's' : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {(cvOnlyQuantity * Number(pricing.cvOnlyPrice)).toFixed(2)}$
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={submitting}>
          Annuler
        </Button>
        <Button
          variant="contained"
          onClick={handleAdd}
          disabled={loading || submitting || (evaluatedQuantity === 0 && cvOnlyQuantity === 0)}
        >
          {submitting ? <CircularProgress size={24} /> : 'Ajouter au panier'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CitySelectDialog;
