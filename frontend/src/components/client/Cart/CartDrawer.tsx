import React, { useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Button,
  List,
  ListItem,
  ListItemText,
  Divider,
  Chip,
  TextField,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Close as CloseIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  ShoppingCart as ShoppingCartIcon,
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

  const handleRemoveItem = async (itemId: string) => {
    try {
      await removeItem(accessToken!, itemId);
      enqueueSnackbar('Item supprimé du panier', { variant: 'success' });
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

  const getTypeColor = (type: string) => {
    return type === 'EVALUATED' ? 'primary' : 'warning';
  };

  const isEmpty = !wishlist || wishlist.items.length === 0;
  const isDraft = wishlist?.status === 'DRAFT';

  return (
    <Drawer
      anchor="right"
      open={drawerOpen}
      onClose={closeDrawer}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '100%', sm: 400 },
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
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Box display="flex" alignItems="center" gap={1}>
            <ShoppingCartIcon color="primary" />
            <Typography variant="h6" fontWeight="bold">
              Mon Panier
            </Typography>
          </Box>
          <IconButton onClick={closeDrawer} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}>
          {isLoading ? (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
              <CircularProgress />
            </Box>
          ) : isEmpty ? (
            <Box textAlign="center" py={8}>
              <ShoppingCartIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                Votre panier est vide
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Ajoutez des candidats depuis les cartes géographiques
              </Typography>
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
                    {index > 0 && <Divider />}
                    <ListItem
                      sx={{
                        px: 0,
                        py: 2,
                        flexDirection: 'column',
                        alignItems: 'stretch',
                      }}
                    >
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                        <Box flex={1}>
                          <Typography variant="subtitle2" fontWeight="bold">
                            {item.city}, {item.province}
                          </Typography>
                          <Chip
                            label={getTypeLabel(item.type)}
                            size="small"
                            color={getTypeColor(item.type)}
                            sx={{ mt: 0.5 }}
                          />
                        </Box>
                        {isDraft && (
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRemoveItem(item.id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>

                      <Box display="flex" justifyContent="space-between" alignItems="center" mt={1}>
                        <Box display="flex" alignItems="center" gap={1}>
                          {isDraft ? (
                            <>
                              <IconButton
                                size="small"
                                onClick={() => handleUpdateQuantity(item.id, item.quantity, -1)}
                                disabled={item.quantity <= 1}
                              >
                                <RemoveIcon fontSize="small" />
                              </IconButton>
                              <Typography variant="body2" fontWeight="bold" sx={{ minWidth: 30, textAlign: 'center' }}>
                                {item.quantity}
                              </Typography>
                              <IconButton
                                size="small"
                                onClick={() => handleUpdateQuantity(item.id, item.quantity, 1)}
                              >
                                <AddIcon fontSize="small" />
                              </IconButton>
                            </>
                          ) : (
                            <Typography variant="body2" fontWeight="bold">
                              Quantité: {item.quantity}
                            </Typography>
                          )}
                        </Box>
                        <Typography variant="body2" fontWeight="bold" color="primary">
                          {item.totalPrice.toFixed(2)}$
                        </Typography>
                      </Box>

                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                        {item.unitPrice.toFixed(2)}$ × {item.quantity}
                      </Typography>
                    </ListItem>
                  </React.Fragment>
                ))}
              </List>
            </>
          )}
        </Box>

        {/* Footer */}
        {!isEmpty && (
          <Box
            sx={{
              p: 2,
              borderTop: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6" fontWeight="bold">
                Total
              </Typography>
              <Typography variant="h5" fontWeight="bold" color="primary">
                {wishlist.totalAmount.toFixed(2)}$
              </Typography>
            </Box>

            {isDraft && (
              <>
                <Button
                  variant="contained"
                  fullWidth
                  size="large"
                  onClick={handleSubmit}
                  disabled={submitting || isLoading}
                  sx={{ mb: 1 }}
                >
                  {submitting ? <CircularProgress size={24} /> : 'Soumettre la demande'}
                </Button>
                <Button
                  variant="outlined"
                  fullWidth
                  color="error"
                  onClick={handleClearCart}
                  disabled={isLoading}
                >
                  Vider le panier
                </Button>
              </>
            )}
          </Box>
        )}
      </Box>
    </Drawer>
  );
};

export default CartDrawer;
