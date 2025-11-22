import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  IconButton,
  Menu,
  MenuItem,
  CircularProgress,
  Alert,
  TextField,
  FormControl,
  InputLabel,
  Select,
  SelectChangeEvent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Visibility as VisibilityIcon,
  AttachMoney as AttachMoneyIcon,
  LocalShipping as LocalShippingIcon,
  ShoppingCart as ShoppingCartIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { wishlistAdminService, Wishlist } from '@/services/wishlist-admin.service';
import { useSnackbar } from 'notistack';

const WishlistsPage = () => {
  const { user, accessToken } = useAuthStore();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedWishlist, setSelectedWishlist] = useState<Wishlist | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  // Fetch all wishlists
  const { data, isLoading, error } = useQuery({
    queryKey: ['wishlists-admin', statusFilter],
    queryFn: () =>
      wishlistAdminService.getAllWishlists(accessToken!, {
        ...(statusFilter && { status: statusFilter }),
      }),
    enabled: !!accessToken,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({
      id,
      status,
      adminNotes,
    }: {
      id: string;
      status: Wishlist['status'];
      adminNotes?: string;
    }) => wishlistAdminService.updateWishlistStatus(accessToken!, id, status, adminNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlists-admin'] });
      enqueueSnackbar('Status mis à jour avec succès', { variant: 'success' });
      handleMenuClose();
    },
    onError: () => {
      enqueueSnackbar('Erreur lors de la mise à jour', { variant: 'error' });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => wishlistAdminService.deleteWishlist(accessToken!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlists-admin'] });
      enqueueSnackbar('Demande annulée', { variant: 'success' });
      handleMenuClose();
    },
    onError: () => {
      enqueueSnackbar("Erreur lors de l'annulation", { variant: 'error' });
    },
  });

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, wishlist: Wishlist) => {
    setAnchorEl(event.currentTarget);
    setSelectedWishlist(wishlist);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedWishlist(null);
  };

  const handleViewDetails = (wishlist: Wishlist) => {
    setSelectedWishlist(wishlist);
    setDetailsDialogOpen(true);
    handleMenuClose();
  };

  const handleUpdateStatus = (status: Wishlist['status']) => {
    if (selectedWishlist) {
      updateStatusMutation.mutate({ id: selectedWishlist.id, status });
    }
  };

  const handleDelete = () => {
    if (selectedWishlist && window.confirm('Êtes-vous sûr de vouloir annuler cette demande?')) {
      deleteMutation.mutate(selectedWishlist.id);
    }
  };

  const getStatusColor = (
    status: string
  ): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
    switch (status) {
      case 'DRAFT':
        return 'default';
      case 'SUBMITTED':
        return 'info';
      case 'APPROVED':
        return 'primary';
      case 'PAID':
        return 'success';
      case 'DELIVERED':
        return 'secondary';
      case 'CANCELLED':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      DRAFT: 'Brouillon',
      SUBMITTED: 'Soumise',
      APPROVED: 'Approuvée',
      PAID: 'Payée',
      DELIVERED: 'Livrée',
      CANCELLED: 'Annulée',
    };
    return labels[status] || status;
  };

  const stats = data?.stats || {
    total: 0,
    submitted: 0,
    approved: 0,
    paid: 0,
    totalRevenue: 0,
    pendingRevenue: 0,
  };

  const wishlists = data?.wishlists || [];

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        Demandes Clients
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Gestion des demandes de candidats des clients
      </Typography>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mt: 2, mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.total}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total demandes
                  </Typography>
                </Box>
                <ShoppingCartIcon sx={{ fontSize: 40, color: '#1976d2' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h4" fontWeight="bold" color="info.main">
                    {stats.submitted}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    À traiter
                  </Typography>
                </Box>
                <TrendingUpIcon sx={{ fontSize: 40, color: '#2196f3' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h4" fontWeight="bold" color="success.main">
                    {stats.totalRevenue.toFixed(2)}$
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Revenu total
                  </Typography>
                </Box>
                <AttachMoneyIcon sx={{ fontSize: 40, color: '#4caf50' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h4" fontWeight="bold" color="warning.main">
                    {stats.pendingRevenue.toFixed(2)}$
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    En attente
                  </Typography>
                </Box>
                <LocalShippingIcon sx={{ fontSize: 40, color: '#ff9800' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Filtrer par status</InputLabel>
                <Select
                  value={statusFilter}
                  label="Filtrer par status"
                  onChange={(e: SelectChangeEvent) => setStatusFilter(e.target.value)}
                >
                  <MenuItem value="">Tous</MenuItem>
                  <MenuItem value="SUBMITTED">Soumises</MenuItem>
                  <MenuItem value="APPROVED">Approuvées</MenuItem>
                  <MenuItem value="PAID">Payées</MenuItem>
                  <MenuItem value="DELIVERED">Livrées</MenuItem>
                  <MenuItem value="CANCELLED">Annulées</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent>
          {isLoading ? (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error">Erreur lors du chargement des demandes</Alert>
          ) : wishlists.length === 0 ? (
            <Alert severity="info">Aucune demande trouvée</Alert>
          ) : (
            <TableContainer component={Paper} elevation={0}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Client</TableCell>
                    <TableCell>Items</TableCell>
                    <TableCell>Total</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Dernière MAJ</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {wishlists.map((wishlist) => (
                    <TableRow key={wishlist.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {wishlist.client.companyName || wishlist.client.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {wishlist.client.email}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {wishlist.items.length} items
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {wishlist.items.reduce((sum, item) => sum + item.quantity, 0)} candidats
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold" color="primary">
                          {Number(wishlist.totalAmount).toFixed(2)}$
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getStatusLabel(wishlist.status)}
                          color={getStatusColor(wishlist.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {new Date(wishlist.updatedAt).toLocaleDateString()}
                          <br />
                          <span style={{ color: '#999', fontSize: '0.7em' }}>
                            Créé: {new Date(wishlist.createdAt).toLocaleDateString()}
                          </span>
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={(e) => handleMenuOpen(e, wishlist)}
                        >
                          <MoreVertIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Actions Menu */}
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
        <MenuItem onClick={() => selectedWishlist && handleViewDetails(selectedWishlist)}>
          <VisibilityIcon fontSize="small" sx={{ mr: 1 }} />
          Voir détails
        </MenuItem>
        {selectedWishlist?.status === 'SUBMITTED' && (
          <MenuItem onClick={() => handleUpdateStatus('APPROVED')}>
            <CheckCircleIcon fontSize="small" sx={{ mr: 1 }} color="success" />
            Approuver
          </MenuItem>
        )}
        {selectedWishlist?.status === 'APPROVED' && (
          <MenuItem onClick={() => handleUpdateStatus('PAID')}>
            <AttachMoneyIcon fontSize="small" sx={{ mr: 1 }} color="success" />
            Marquer payée
          </MenuItem>
        )}
        {selectedWishlist?.status === 'PAID' && (
          <MenuItem onClick={() => handleUpdateStatus('DELIVERED')}>
            <LocalShippingIcon fontSize="small" sx={{ mr: 1 }} color="primary" />
            Marquer livrée
          </MenuItem>
        )}
        <Divider />
        <MenuItem onClick={handleDelete}>
          <CancelIcon fontSize="small" sx={{ mr: 1 }} color="error" />
          Annuler
        </MenuItem>
      </Menu>

      {/* Details Dialog */}
      <Dialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">Détails de la demande</Typography>
            {selectedWishlist && (
              <Chip
                label={getStatusLabel(selectedWishlist.status)}
                color={getStatusColor(selectedWishlist.status)}
              />
            )}
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedWishlist && (
            <Box>
              {/* Client Info */}
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                Informations client
              </Typography>
              <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                <Typography variant="body2">
                  <strong>Nom:</strong> {selectedWishlist.client.companyName || selectedWishlist.client.name}
                </Typography>
                <Typography variant="body2">
                  <strong>Email:</strong> {selectedWishlist.client.email}
                </Typography>
                {selectedWishlist.client.phone && (
                  <Typography variant="body2">
                    <strong>Téléphone:</strong> {selectedWishlist.client.phone}
                  </Typography>
                )}
              </Box>

              {/* Items List */}
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                Items demandés
              </Typography>
              <List dense>
                {selectedWishlist.items.map((item, index) => (
                  <ListItem key={index} sx={{ bgcolor: 'grey.50', mb: 1, borderRadius: 1 }}>
                    <ListItemText
                      primary={
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2" fontWeight="bold">
                            {item.city}, {item.province}
                          </Typography>
                          <Chip
                            label={item.type === 'EVALUATED' ? 'Évalués' : 'CVs'}
                            color={item.type === 'EVALUATED' ? 'primary' : 'warning'}
                            size="small"
                          />
                        </Box>
                      }
                      secondary={
                        <Box mt={0.5}>
                          <Typography variant="caption" display="block">
                            Quantité: {item.quantity} × {Number(item.unitPrice).toFixed(2)}$ ={' '}
                            <strong>{Number(item.totalPrice).toFixed(2)}$</strong>
                          </Typography>
                          {item.notes && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              Note: {item.notes}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>

              {/* Total */}
              <Box sx={{ mt: 2, p: 2, bgcolor: 'primary.50', borderRadius: 1 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6" fontWeight="bold">
                    Total
                  </Typography>
                  <Typography variant="h5" fontWeight="bold" color="primary">
                    {Number(selectedWishlist.totalAmount).toFixed(2)}$
                  </Typography>
                </Box>
              </Box>

              {/* Admin Notes */}
              {selectedWishlist.adminNotes && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                    Notes admin
                  </Typography>
                  <Alert severity="info">{selectedWishlist.adminNotes}</Alert>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsDialogOpen(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WishlistsPage;
