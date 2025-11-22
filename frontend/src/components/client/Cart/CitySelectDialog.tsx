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
  IconButton,
  Stack,
  Paper,
} from '@mui/material';
import {
  LocationOn as LocationIcon,
  Person as PersonIcon,
  Description as DescriptionIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  AttachMoney as MoneyIcon,
  Inventory as InventoryIcon,
  Notes as NotesIcon,
} from '@mui/icons-material';
import { useWishlistStore, CandidateType } from '@/store/wishlistStore';
import { useClientAuthStore } from '@/store/clientAuthStore';
import { useSnackbar } from 'notistack';
import { animations, transitions } from '@/utils/animations';
import { candidateColors } from '@/constants/colors';

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

  // Quick add functions
  const quickAddEvaluated = (amount: number) => {
    const newValue = Math.max(0, Math.min(availability.evaluated, evaluatedQuantity + amount));
    setEvaluatedQuantity(newValue);
  };

  const quickAddCvOnly = (amount: number) => {
    const newValue = Math.max(0, Math.min(availability.cvOnly, cvOnlyQuantity + amount));
    setCvOnlyQuantity(newValue);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={1}>
            <LocationIcon color="primary" />
            <Typography variant="h6" fontWeight="bold">
              {city}, {province}
            </Typography>
          </Box>
          {!loading && availability && (
            <Chip
              icon={<InventoryIcon />}
              label={`${availability.evaluated + availability.cvOnly} candidats disponibles`}
              color="primary"
              variant="outlined"
              size="small"
            />
          )}
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
          <Stack spacing={2}>
            {/* Pricing Overview at the top */}
            <Paper elevation={0} sx={{ p: 2, bgcolor: 'info.50', border: '1px solid', borderColor: 'info.200' }}>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <MoneyIcon color="info" fontSize="small" />
                <Typography variant="subtitle2" fontWeight="bold">
                  Tarification pour {city}
                </Typography>
              </Box>
              <Stack direction="row" spacing={2} divider={<Divider orientation="vertical" flexItem />}>
                <Box flex={1}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Candidats Évalués
                  </Typography>
                  <Typography variant="h6" color="primary" fontWeight="bold">
                    {Number(pricing.evaluatedCandidatePrice).toFixed(2)}$
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    par candidat
                  </Typography>
                </Box>
                <Box flex={1}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    CVs Seulement
                  </Typography>
                  <Typography variant="h6" color="warning.main" fontWeight="bold">
                    {Number(pricing.cvOnlyPrice).toFixed(2)}$
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    par CV
                  </Typography>
                </Box>
              </Stack>
            </Paper>

            {/* Evaluated Candidates */}
            <Box sx={{ p: 2, bgcolor: 'primary.50', borderRadius: 2, border: '2px solid', borderColor: evaluatedQuantity > 0 ? 'primary.main' : 'transparent' }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Box display="flex" alignItems="center" gap={1}>
                  <PersonIcon color="primary" fontSize="small" />
                  <Typography variant="subtitle2" fontWeight="bold" color="primary">
                    Candidats Évalués (Premium)
                  </Typography>
                </Box>
                <Chip
                  label={`${availability.evaluated} disponibles`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              </Box>
              <Typography variant="caption" color="text.secondary" display="block" mb={2}>
                ✓ Déjà interviewés • ✓ Vidéo d'entrevue • ✓ Notes RH • ✓ Évaluations complètes
              </Typography>

              {/* Quick add buttons */}
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <Typography variant="caption" fontWeight="bold" sx={{ minWidth: 80 }}>
                  Ajouter:
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => quickAddEvaluated(1)}
                  disabled={evaluatedQuantity >= availability.evaluated}
                >
                  +1
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => quickAddEvaluated(5)}
                  disabled={evaluatedQuantity + 5 > availability.evaluated}
                >
                  +5
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => quickAddEvaluated(10)}
                  disabled={evaluatedQuantity + 10 > availability.evaluated}
                >
                  +10
                </Button>
                <Button
                  size="small"
                  variant="text"
                  color="error"
                  onClick={() => setEvaluatedQuantity(0)}
                  disabled={evaluatedQuantity === 0}
                >
                  Réinitialiser
                </Button>
              </Box>

              {/* Quantity control */}
              <Box display="flex" alignItems="center" gap={1}>
                <IconButton
                  size="small"
                  onClick={() => quickAddEvaluated(-1)}
                  disabled={evaluatedQuantity === 0}
                  sx={{ bgcolor: 'background.paper' }}
                >
                  <RemoveIcon fontSize="small" />
                </IconButton>
                <TextField
                  type="number"
                  value={evaluatedQuantity}
                  onChange={(e) => setEvaluatedQuantity(Math.max(0, Math.min(availability.evaluated, parseInt(e.target.value) || 0)))}
                  size="small"
                  sx={{ width: 100 }}
                  inputProps={{ min: 0, max: availability.evaluated, style: { textAlign: 'center' } }}
                />
                <IconButton
                  size="small"
                  onClick={() => quickAddEvaluated(1)}
                  disabled={evaluatedQuantity >= availability.evaluated}
                  sx={{ bgcolor: 'background.paper' }}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
                {evaluatedQuantity > 0 && (
                  <Typography variant="body2" fontWeight="bold" color="primary" ml={1}>
                    = {(evaluatedQuantity * Number(pricing.evaluatedCandidatePrice)).toFixed(2)}$
                  </Typography>
                )}
              </Box>
            </Box>

            {/* CV Only */}
            <Box sx={{ p: 2, bgcolor: 'warning.50', borderRadius: 2, border: '2px solid', borderColor: cvOnlyQuantity > 0 ? 'warning.main' : 'transparent' }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Box display="flex" alignItems="center" gap={1}>
                  <DescriptionIcon color="warning" fontSize="small" />
                  <Typography variant="subtitle2" fontWeight="bold" color="warning.main">
                    CVs Seulement (Économique)
                  </Typography>
                </Box>
                <Chip
                  label={`${availability.cvOnly} disponibles`}
                  size="small"
                  color="warning"
                  variant="outlined"
                />
              </Box>
              <Typography variant="caption" color="text.secondary" display="block" mb={2}>
                CVs uniquement - Vous faites l'entrevue vous-même • Parfait pour économiser!
              </Typography>

              {/* Quick add buttons */}
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <Typography variant="caption" fontWeight="bold" sx={{ minWidth: 80 }}>
                  Ajouter:
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => quickAddCvOnly(1)}
                  disabled={cvOnlyQuantity >= availability.cvOnly}
                >
                  +1
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => quickAddCvOnly(5)}
                  disabled={cvOnlyQuantity + 5 > availability.cvOnly}
                >
                  +5
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => quickAddCvOnly(10)}
                  disabled={cvOnlyQuantity + 10 > availability.cvOnly}
                >
                  +10
                </Button>
                <Button
                  size="small"
                  variant="text"
                  color="error"
                  onClick={() => setCvOnlyQuantity(0)}
                  disabled={cvOnlyQuantity === 0}
                >
                  Réinitialiser
                </Button>
              </Box>

              {/* Quantity control */}
              <Box display="flex" alignItems="center" gap={1}>
                <IconButton
                  size="small"
                  onClick={() => quickAddCvOnly(-1)}
                  disabled={cvOnlyQuantity === 0}
                  sx={{ bgcolor: 'background.paper' }}
                >
                  <RemoveIcon fontSize="small" />
                </IconButton>
                <TextField
                  type="number"
                  value={cvOnlyQuantity}
                  onChange={(e) => setCvOnlyQuantity(Math.max(0, Math.min(availability.cvOnly, parseInt(e.target.value) || 0)))}
                  size="small"
                  sx={{ width: 100 }}
                  inputProps={{ min: 0, max: availability.cvOnly, style: { textAlign: 'center' } }}
                />
                <IconButton
                  size="small"
                  onClick={() => quickAddCvOnly(1)}
                  disabled={cvOnlyQuantity >= availability.cvOnly}
                  sx={{ bgcolor: 'background.paper' }}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
                {cvOnlyQuantity > 0 && (
                  <Typography variant="body2" fontWeight="bold" color="warning.main" ml={1}>
                    = {(cvOnlyQuantity * Number(pricing.cvOnlyPrice)).toFixed(2)}$
                  </Typography>
                )}
              </Box>
            </Box>

            {/* Notes / Special Requests */}
            <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <NotesIcon fontSize="small" color="action" />
                <Typography variant="subtitle2" fontWeight="bold">
                  Notes / Demandes spéciales
                </Typography>
              </Box>
              <TextField
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                fullWidth
                multiline
                rows={3}
                size="small"
                placeholder="Ex: Recherche agents pour événement sportif le 15 juin, préférence bilingues..."
                variant="outlined"
              />
            </Box>

            {/* Total Cost Calculation */}
            {(evaluatedQuantity > 0 || cvOnlyQuantity > 0) && (
              <Paper elevation={3} sx={{ p: 2, bgcolor: 'success.50', border: '2px solid', borderColor: 'success.main' }}>
                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                  RÉSUMÉ DE VOTRE DEMANDE
                </Typography>
                <Divider sx={{ mb: 1.5 }} />

                {evaluatedQuantity > 0 && (
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="body2">
                      {evaluatedQuantity} candidat{evaluatedQuantity > 1 ? 's' : ''} évalué{evaluatedQuantity > 1 ? 's' : ''} × {Number(pricing.evaluatedCandidatePrice).toFixed(2)}$
                    </Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {(evaluatedQuantity * Number(pricing.evaluatedCandidatePrice)).toFixed(2)}$
                    </Typography>
                  </Box>
                )}

                {cvOnlyQuantity > 0 && (
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="body2">
                      {cvOnlyQuantity} CV{cvOnlyQuantity > 1 ? 's' : ''} × {Number(pricing.cvOnlyPrice).toFixed(2)}$
                    </Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {(cvOnlyQuantity * Number(pricing.cvOnlyPrice)).toFixed(2)}$
                    </Typography>
                  </Box>
                )}

                <Divider sx={{ my: 1.5 }} />

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6" fontWeight="bold">
                    Total estimé
                  </Typography>
                  <Typography variant="h5" fontWeight="bold" color="success.main">
                    {calculateTotal().toFixed(2)}$
                  </Typography>
                </Box>

                <Typography variant="caption" color="text.secondary" display="block" mt={1} textAlign="center">
                  Prix final confirmé lors de la validation de la demande
                </Typography>
              </Paper>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={submitting}>
          Annuler
        </Button>
        <Button
          variant="contained"
          size="large"
          onClick={handleAdd}
          disabled={loading || submitting || (evaluatedQuantity === 0 && cvOnlyQuantity === 0)}
          startIcon={submitting ? <CircularProgress size={20} /> : <AddIcon />}
        >
          {submitting ? 'Ajout en cours...' : `Ajouter au panier (${calculateTotal().toFixed(2)}$)`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CitySelectDialog;
