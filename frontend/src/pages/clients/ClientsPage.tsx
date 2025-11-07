import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  CircularProgress,
  Alert,
  Pagination,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Restore as RestoreIcon,
  Search as SearchIcon,
  Business as BusinessIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { clientService, Client } from '@/services/client.service';

export default function ClientsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<string>('true');
  const [formData, setFormData] = useState({
    name: '',
    companyName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    province: 'QC',
    postalCode: '',
    notes: '',
  });

  // Fetch clients
  const { data, isLoading, error } = useQuery({
    queryKey: ['clients', page, pageSize, search, filterActive],
    queryFn: () =>
      clientService.getClients({
        page,
        limit: pageSize,
        search: search || undefined,
        isActive: filterActive === '' ? undefined : filterActive === 'true',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: clientService.createClient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      enqueueSnackbar('Client créé avec succès !', { variant: 'success' });
      handleCloseDialog();
      setPage(1);
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.error || 'Erreur lors de la création', {
        variant: 'error',
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Client> }) =>
      clientService.updateClient(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      enqueueSnackbar('Client modifié avec succès !', { variant: 'success' });
      handleCloseDialog();
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.error || 'Erreur lors de la modification', {
        variant: 'error',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: clientService.deleteClient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      enqueueSnackbar('Client désactivé avec succès !', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.error || 'Erreur lors de la désactivation', {
        variant: 'error',
      });
    },
  });

  // Reactivate mutation
  const reactivateMutation = useMutation({
    mutationFn: clientService.reactivateClient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      enqueueSnackbar('Client réactivé avec succès !', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.error || 'Erreur lors de la réactivation', {
        variant: 'error',
      });
    },
  });

  const handleOpenCreate = () => {
    setEditingClient(null);
    setFormData({
      name: '',
      companyName: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      province: 'QC',
      postalCode: '',
      notes: '',
    });
    setOpenDialog(true);
  };

  const handleOpenEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      companyName: client.companyName || '',
      email: client.email,
      phone: client.phone || '',
      address: client.address || '',
      city: client.city || '',
      province: client.province || 'QC',
      postalCode: client.postalCode || '',
      notes: client.notes || '',
    });
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingClient(null);
  };

  const handleSave = () => {
    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir désactiver ce client ?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleReactivate = (id: string) => {
    reactivateMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">
        Erreur lors du chargement des clients. Veuillez réessayer.
      </Alert>
    );
  }

  const clients = data?.data || [];

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">
          Clients ({data?.pagination.total || 0})
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
        >
          Ajouter un client
        </Button>
      </Box>

      {/* Search and Filters */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                placeholder="Rechercher par nom, entreprise ou email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Statut</InputLabel>
                <Select
                  value={filterActive}
                  label="Statut"
                  onChange={(e) => {
                    setFilterActive(e.target.value);
                    setPage(1);
                  }}
                >
                  <MenuItem value="">Tous</MenuItem>
                  <MenuItem value="true">Actifs</MenuItem>
                  <MenuItem value="false">Inactifs</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {clients.length === 0 ? (
            <Box textAlign="center" py={4}>
              <BusinessIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                Aucun client trouvé
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Commencez par ajouter votre premier client !
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleOpenCreate}
              >
                Ajouter un client
              </Button>
            </Box>
          ) : (
            <TableContainer component={Paper} elevation={0}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Nom</strong></TableCell>
                    <TableCell><strong>Entreprise</strong></TableCell>
                    <TableCell><strong>Email</strong></TableCell>
                    <TableCell><strong>Téléphone</strong></TableCell>
                    <TableCell><strong>Ville</strong></TableCell>
                    <TableCell><strong>Catalogues</strong></TableCell>
                    <TableCell><strong>Statut</strong></TableCell>
                    <TableCell align="right"><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id} hover>
                      <TableCell>{client.name}</TableCell>
                      <TableCell>{client.companyName || '-'}</TableCell>
                      <TableCell>{client.email}</TableCell>
                      <TableCell>{client.phone || '-'}</TableCell>
                      <TableCell>{client.city || '-'}</TableCell>
                      <TableCell>{client._count?.catalogues || 0}</TableCell>
                      <TableCell>
                        <Chip
                          label={client.isActive ? 'Actif' : 'Inactif'}
                          color={client.isActive ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="secondary"
                          onClick={() => handleOpenEdit(client)}
                          title="Modifier"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        {client.isActive ? (
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDelete(client.id)}
                            title="Désactiver"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        ) : (
                          <IconButton
                            size="small"
                            color="success"
                            onClick={() => handleReactivate(client.id)}
                            title="Réactiver"
                          >
                            <RestoreIcon fontSize="small" />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Pagination */}
          {clients.length > 0 && data?.pagination && (
            <Box display="flex" justifyContent="center" alignItems="center" mt={3} gap={2}>
              <Typography variant="body2" color="text.secondary">
                Page {data.pagination.page} sur {data.pagination.totalPages} ({data.pagination.total} clients au total)
              </Typography>
              <Pagination
                count={data.pagination.totalPages}
                page={page}
                onChange={(_, newPage) => setPage(newPage)}
                color="primary"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingClient ? 'Modifier le client' : 'Ajouter un nouveau client'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Nom du contact"
                fullWidth
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Nom de l'entreprise"
                fullWidth
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Email"
                type="email"
                fullWidth
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Téléphone"
                fullWidth
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Adresse"
                fullWidth
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Ville"
                fullWidth
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth>
                <InputLabel>Province</InputLabel>
                <Select
                  value={formData.province}
                  label="Province"
                  onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                >
                  <MenuItem value="QC">Québec</MenuItem>
                  <MenuItem value="ON">Ontario</MenuItem>
                  <MenuItem value="BC">Colombie-Britannique</MenuItem>
                  <MenuItem value="AB">Alberta</MenuItem>
                  <MenuItem value="MB">Manitoba</MenuItem>
                  <MenuItem value="SK">Saskatchewan</MenuItem>
                  <MenuItem value="NS">Nouvelle-Écosse</MenuItem>
                  <MenuItem value="NB">Nouveau-Brunswick</MenuItem>
                  <MenuItem value="PE">Île-du-Prince-Édouard</MenuItem>
                  <MenuItem value="NL">Terre-Neuve-et-Labrador</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                label="Code postal"
                fullWidth
                value={formData.postalCode}
                onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes"
                multiline
                rows={4}
                fullWidth
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notes internes sur le client..."
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Annuler</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={
              !formData.name ||
              !formData.email ||
              createMutation.isPending ||
              updateMutation.isPending
            }
          >
            {createMutation.isPending || updateMutation.isPending ? (
              <CircularProgress size={24} />
            ) : editingClient ? (
              'Modifier'
            ) : (
              'Créer'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
