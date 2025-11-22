import React, { useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Button,
  List,
  ListItem,
  Divider,
  Chip,
  TextField,
  CircularProgress,
  Alert,
  Paper,
  Stack,
  Collapse,
} from '@mui/material';
import {
  Close as CloseIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  ShoppingCart as ShoppingCartIcon,
  Send as SendIcon,
  DeleteSweep as DeleteSweepIcon,
  LocationOn as LocationIcon,
  Edit as EditIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { useWishlistStore, WishlistItem } from '@/store/wishlistStore';
import { useClientAuthStore } from '@/store/clientAuthStore';
import { useSnackbar } from 'notistack';

const CartDrawer: React.FC = () => {
  const { drawerOpen, closeDrawer, wishlist, isLoading, updateItem, removeItem, clearWishlist, submitWishlist } =
    useWishlistStore();
  const { accessToken } = useClientAuthStore();
  const { enqueueSnackbar } = useSnackbar();
  const [submitting, setSubmitting] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(0);

  const handleUpdateQuantity = async (itemId: string, currentQuantity: number, change: number) => {
    const newQuantity = currentQuantity + change;
    if (newQuantity < 1) return;

    try {
      await updateItem(accessToken!, itemId, newQuantity);
      enqueueSnackbar('Quantité mise à jour', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar('Erreur lors de la mise à jour', { variant: 'error' });
    }
  };

  const startEditing = (itemId: string, currentQuantity: number) => {
    setEditingItemId(itemId);
    setEditQuantity(currentQuantity);
  };

  const saveEdit = async (itemId: string) => {
    if (editQuantity < 1) {
      enqueueSnackbar('La quantité doit être au moins 1', { variant: 'warning' });
      return;
    }

    try {
      await updateItem(accessToken!, itemId, editQuantity);
      setEditingItemId(null);
      enqueueSnackbar('Quantité mise à jour', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar('Erreur lors de la mise à jour', { variant: 'error' });
    }
  };

  const cancelEdit = () => {
    setEditingItemId(null);
    setEditQuantity(0);
  };

  const handleRemoveItem = async (itemId: string, cityName: string) => {
    if (!window.confirm(`Retirer ${cityName} du panier?`)) return;

    try {
      await removeItem(accessToken!, itemId);
      enqueueSnackbar('Article retiré du panier', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar('Erreur lors de la suppression', { variant: 'error' });
    }
  };

  const handleClearCart = async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir vider le panier?')) return;

    try {
      await clearWishlist(accessToken!);
      enqueueSnackbar('Panier vidé', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar('Erreur lors du vidage du panier', { variant: 'error' });
    }
  };

  const handleSubmit = async () => {
    if (!wishlist || wishlist.items.length === 0) {
      enqueueSnackbar('Le panier est vide', { variant: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      await submitWishlist(accessToken!);
      enqueueSnackbar('Demande soumise avec succès! Nous vous contacterons bientôt.', {
        variant: 'success',
        autoHideDuration: 5000,
      });
      closeDrawer();
    } catch (error) {
      enqueueSnackbar('Erreur lors de la soumission', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const getTypeLabel = (type: string) => {
    return type === 'EVALUATED' ? 'Candidats Évalués' : 'CVs Seulement';
  };

  const getTypeColor = (type: string): 'primary' | 'warning' => {
    return type === 'EVALUATED' ? 'primary' : 'warning';
  };

  const isEmpty = !wishlist || wishlist.items.length === 0;
  const isDraft = wishlist?.status === 'DRAFT';
  const itemCount = wishlist?.items.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return (
    <Drawer
      anchor="right"
      open={drawerOpen}
      onClose={closeDrawer}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '100%', sm: 450 },
        },
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: 2,
            borderColor: 'primary.main',
            bgcolor: 'primary.50',
          }}
        >
          <Box display="flex" alignItems="center" gap={1.5}>
            <ShoppingCartIcon color="primary" fontSize="large" />
            <Box>
              <Typography variant="h6" fontWeight="bold">
                Mon Panier
              </Typography>
              {!isEmpty && (
                <Typography variant="caption" color="text.secondary">
                  {itemCount} article{itemCount > 1 ? 's' : ''}
                </Typography>
              )}
            </Box>
          </Box>
          <IconButton onClick={closeDrawer} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Running Total Bar - Always visible when not empty */}
        {!isEmpty && (
          <Paper
            elevation={3}
            sx={{
              p: 1.5,
              m: 2,
              mb: 1,
              bgcolor: 'success.50',
              border: '2px solid',
              borderColor: 'success.main',
            }}
          >
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" fontWeight="bold">
                Total estimé
              </Typography>
              <Typography variant="h5" fontWeight="bold" color="success.main">
                {Number(wishlist.totalAmount).toFixed(2)}$
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" display="block" textAlign="right">
              {itemCount} article{itemCount > 1 ? 's' : ''} • Taxes non incluses
            </Typography>
          </Paper>
        )}

        {/* Content */}
        <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 2, pb: 2 }}>
          {isLoading ? (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
              <CircularProgress />
            </Box>
          ) : isEmpty ? (
            <Box textAlign="center" py={8}>
              <ShoppingCartIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                Votre panier est vide
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>
                Ajoutez des candidats depuis la carte
              </Typography>
              <Button variant="outlined" onClick={closeDrawer}>
                Parcourir les candidats
              </Button>
            </Box>
          ) : (
            <>
              {!isDraft && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Cette demande a été soumise et ne peut plus être modifiée.
                </Alert>
              )}

              <List disablePadding>
                {wishlist.items.map((item, index) => (
                  <React.Fragment key={item.id}>
                    {index > 0 && <Divider sx={{ my: 1 }} />}
                    <Paper
                      elevation={1}
                      sx={{
                        p: 2,
                        mb: 1,
                        border: '1px solid',
                        borderColor: editingItemId === item.id ? 'primary.main' : 'divider',
                        bgcolor: editingItemId === item.id ? 'primary.50' : 'background.paper',
                        transition: 'all 0.2s',
                      }}
                    >
                      {/* City and Type */}
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
                        <Box flex={1}>
                          <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                            <LocationIcon fontSize="small" color="action" />
                            <Typography variant="subtitle2" fontWeight="bold">
                              {item.city}, {item.province}
                            </Typography>
                          </Box>
                          <Chip
                            label={getTypeLabel(item.type)}
                            size="small"
                            color={getTypeColor(item.type)}
                          />
                        </Box>
                        {isDraft && (
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRemoveItem(item.id, item.city)}
                            sx={{ ml: 1 }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>

                      {/* Quantity Controls */}
                      <Box display="flex" justifyContent="space-between" alignItems="center">
                        {isDraft ? (
                          editingItemId === item.id ? (
                            // Inline editing mode
                            <Box display="flex" alignItems="center" gap={1}>
                              <TextField
                                type="number"
                                value={editQuantity}
                                onChange={(e) => setEditQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                size="small"
                                sx={{ width: 80 }}
                                inputProps={{ min: 1, style: { textAlign: 'center' } }}
                                autoFocus
                              />
                              <IconButton
                                size="small"
                                color="success"
                                onClick={() => saveEdit(item.id)}
                              >
                                <CheckIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={cancelEdit}
                              >
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          ) : (
                            // Normal mode with +/- buttons
                            <Box display="flex" alignItems="center" gap={1}>
                              <IconButton
                                size="small"
                                onClick={() => handleUpdateQuantity(item.id, item.quantity, -1)}
                                disabled={item.quantity <= 1}
                                sx={{ bgcolor: 'background.default' }}
                              >
                                <RemoveIcon fontSize="small" />
                              </IconButton>
                              <Box
                                onClick={() => startEditing(item.id, item.quantity)}
                                sx={{
                                  minWidth: 50,
                                  textAlign: 'center',
                                  cursor: 'pointer',
                                  p: 0.5,
                                  borderRadius: 1,
                                  '&:hover': {
                                    bgcolor: 'action.hover',
                                  },
                                }}
                              >
                                <Typography variant="body2" fontWeight="bold">
                                  {item.quantity}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.65rem' }}>
                                  cliquez
                                </Typography>
                              </Box>
                              <IconButton
                                size="small"
                                onClick={() => handleUpdateQuantity(item.id, item.quantity, 1)}
                                sx={{ bgcolor: 'background.default' }}
                              >
                                <AddIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          )
                        ) : (
                          <Typography variant="body2" fontWeight="bold">
                            Quantité: {item.quantity}
                          </Typography>
                        )}

                        {/* Price */}
                        <Box textAlign="right">
                          <Typography variant="h6" fontWeight="bold" color="primary">
                            {Number(item.totalPrice).toFixed(2)}$
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {Number(item.unitPrice).toFixed(2)}$ × {item.quantity}
                          </Typography>
                        </Box>
                      </Box>

                      {/* Notes if any */}
                      {item.notes && (
                        <Box mt={1.5} p={1} bgcolor="grey.100" borderRadius={1}>
                          <Typography variant="caption" color="text.secondary" fontWeight="bold" display="block">
                            Note:
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.notes}
                          </Typography>
                        </Box>
                      )}
                    </Paper>
                  </React.Fragment>
                ))}
              </List>
            </>
          )}
        </Box>

        {/* Footer Actions */}
        {!isEmpty && (
          <Box
            sx={{
              p: 2,
              borderTop: 2,
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            {isDraft && (
              <Stack spacing={1}>
                <Button
                  variant="contained"
                  fullWidth
                  size="large"
                  onClick={handleSubmit}
                  disabled={submitting || isLoading}
                  startIcon={submitting ? <CircularProgress size={20} /> : <SendIcon />}
                  sx={{ fontWeight: 'bold' }}
                >
                  {submitting ? 'Envoi en cours...' : `Soumettre la demande (${Number(wishlist.totalAmount).toFixed(2)}$)`}
                </Button>
                <Button
                  variant="outlined"
                  fullWidth
                  color="error"
                  onClick={handleClearCart}
                  disabled={isLoading}
                  startIcon={<DeleteSweepIcon />}
                >
                  Vider le panier
                </Button>
              </Stack>
            )}
          </Box>
        )}
      </Box>
    </Drawer>
  );
};

export default CartDrawer;
