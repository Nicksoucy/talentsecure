import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
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
  Alert,
  FormControlLabel,
  Checkbox,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Autocomplete,
} from '@mui/material';
import {
  Add as AddIcon,
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  PictureAsPdf as PdfIcon,
  Close as CloseIcon,
  Share as ShareIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { catalogueService } from '@/services/catalogue.service';
import { candidateService } from '@/services/candidate.service';
import { clientService } from '@/services/client.service';
import { TableSkeleton } from '@/components/skeletons';
import CandidateAdvancedFilters, { CandidateFilters } from '@/components/CandidateAdvancedFilters';
import ShareCatalogueDialog from '@/components/catalogues/ShareCatalogueDialog';

const STATUS_COLORS: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  BROUILLON: 'default',
  GENERE: 'info',
  ENVOYE: 'success',
  ACCEPTE: 'success',
  REFUSE: 'error',
};

const STATUS_LABELS: Record<string, string> = {
  BROUILLON: 'Brouillon',
  GENERE: 'Généré',
  ENVOYE: 'Envoyé',
  ACCEPTE: 'Accepté',
  REFUSE: 'Refusé',
};

export default function CataloguesPage() {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [openShareDialog, setOpenShareDialog] = useState(false);
  const [selectedCatalogueForShare, setSelectedCatalogueForShare] = useState<any>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [searchFilters, setSearchFilters] = useState<CandidateFilters>({});
  const [foundCandidates, setFoundCandidates] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    customMessage: '',
    includeSummary: true,
    includeDetails: true,
    includeVideo: true,
    includeExperience: true,
    includeSituation: true,
    includeCV: true,
  });

  // Fetch catalogues
  const { data: catalogues, isLoading, error } = useQuery({
    queryKey: ['catalogues'],
    queryFn: () => catalogueService.getCatalogues(),
  });

  // Fetch clients (active only)
  const { data: clients } = useQuery({
    queryKey: ['clients', 'active'],
    queryFn: () => clientService.getClients({ isActive: true, limit: 1000 }),
  });

  // Create catalogue mutation
  const createMutation = useMutation({
    mutationFn: catalogueService.createCatalogue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogues'] });
      enqueueSnackbar('Catalogue créé avec succès !', { variant: 'success' });
      setOpenCreateDialog(false);
      resetForm();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error || 'Erreur lors de la création du catalogue',
        { variant: 'error' }
      );
    },
  });

  // Delete catalogue mutation
  const deleteMutation = useMutation({
    mutationFn: catalogueService.deleteCatalogue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogues'] });
      enqueueSnackbar('Catalogue supprimé avec succès !', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error || 'Erreur lors de la suppression',
        { variant: 'error' }
      );
    },
  });

  // Generate PDF mutation
  const generateMutation = useMutation({
    mutationFn: catalogueService.generateCataloguePDF,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['catalogues'] });
      enqueueSnackbar(
        data.message || 'PDF généré avec succès !',
        { variant: 'success' }
      );
    },
    onError: (error: any) => {
      console.error('PDF Generation Error:', error);
      console.error('Error Response:', error.response?.data);
      const errorMessage = error.response?.data?.error || error.message || 'Erreur lors de la génération du PDF';
      enqueueSnackbar(errorMessage, { variant: 'error' });
    },
  });

  const resetForm = () => {
    setFormData({
      title: '',
      customMessage: '',
      includeSummary: true,
      includeDetails: true,
      includeVideo: true,
      includeExperience: true,
      includeSituation: true,
      includeCV: true,
    });
    setSelectedCandidates([]);
    setSelectedClient(null);
  };

  const handleCreateCatalogue = () => {
    if (!formData.title || !selectedClient) {
      enqueueSnackbar('Veuillez remplir le titre et sélectionner un client', { variant: 'warning' });
      return;
    }

    if (selectedCandidates.length === 0) {
      enqueueSnackbar('Veuillez sélectionner au moins un candidat', { variant: 'warning' });
      return;
    }

    const payload = {
      ...formData,
      clientId: selectedClient.id,
      candidateIds: selectedCandidates.map((c) => c.id),
    };

    createMutation.mutate(payload);
  };

  const handleDeleteCatalogue = (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce catalogue ?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleGeneratePDF = (id: string) => {
    generateMutation.mutate(id);
  };

  const handleShareCatalogue = (catalogue: any) => {
    setSelectedCatalogueForShare(catalogue);
    setOpenShareDialog(true);
  };

  const handleCloseShareDialog = () => {
    setOpenShareDialog(false);
    setSelectedCatalogueForShare(null);
  };

  const handleRemoveCandidate = (candidateId: string) => {
    setSelectedCandidates(
      selectedCandidates.filter((c) => c.id !== candidateId)
    );
  };

  const handleSearchCandidates = async () => {
    try {
      const result = await candidateService.getCandidates({
        ...searchFilters,
        limit: 1000,
      });
      setFoundCandidates(result.data);
    } catch (error) {
      enqueueSnackbar('Erreur lors de la recherche de candidats', { variant: 'error' });
    }
  };

  const handleAddCandidate = (candidate: any) => {
    if (!selectedCandidates.find((c) => c.id === candidate.id)) {
      setSelectedCandidates([...selectedCandidates, candidate]);
    }
  };

  const handleAddAllCandidates = () => {
    const newCandidates = foundCandidates.filter(
      (candidate) => !selectedCandidates.find((c) => c.id === candidate.id)
    );
    setSelectedCandidates([...selectedCandidates, ...newCandidates]);
  };

  // Function to load ALL candidates
  const handleLoadAllCandidates = async () => {
    try {
      const result = await candidateService.getCandidates({
        limit: 1000, // Get all candidates
      });
      setFoundCandidates(result.data);
      enqueueSnackbar(`${result.data.length} candidat(s) chargé(s)`, { variant: 'success' });
    } catch (error) {
      enqueueSnackbar('Erreur lors du chargement des candidats', { variant: 'error' });
    }
  };

  // Auto-load all candidates when dialog opens
  useEffect(() => {
    if (openCreateDialog) {
      handleLoadAllCandidates();
    }
  }, [openCreateDialog]);

  if (isLoading) {
    return <TableSkeleton rows={8} columns={5} hasHeader hasActions />;
  }

  if (error) {
    return (
      <Alert severity="error">
        Erreur lors du chargement des catalogues. Veuillez réessayer.
      </Alert>
    );
  }

  const cataloguesList = catalogues?.data || [];

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">
          Catalogues ({cataloguesList.length})
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenCreateDialog(true)}
        >
          Créer un catalogue
        </Button>
      </Box>

      <Card>
        <CardContent>
          {cataloguesList.length === 0 ? (
            <Box textAlign="center" py={4}>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                Aucun catalogue trouvé
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Commencez par créer votre premier catalogue !
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setOpenCreateDialog(true)}
              >
                Créer un catalogue
              </Button>
            </Box>
          ) : (
            <TableContainer component={Paper} elevation={0}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Titre</strong></TableCell>
                    <TableCell><strong>Client</strong></TableCell>
                    <TableCell><strong>Candidats</strong></TableCell>
                    <TableCell><strong>Statut</strong></TableCell>
                    <TableCell><strong>Inclut CV</strong></TableCell>
                    <TableCell><strong>Créé le</strong></TableCell>
                    <TableCell align="right"><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cataloguesList.map((catalogue: any) => (
                    <TableRow key={catalogue.id} hover>
                      <TableCell>{catalogue.title}</TableCell>
                      <TableCell>
                        {catalogue.client?.companyName || catalogue.client?.name || '-'}
                      </TableCell>
                      <TableCell>{catalogue.items?.length || 0}</TableCell>
                      <TableCell>
                        <Chip
                          label={STATUS_LABELS[catalogue.status] || catalogue.status}
                          color={STATUS_COLORS[catalogue.status] || 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{catalogue.includeCV ? '✓' : '-'}</TableCell>
                      <TableCell>
                        {new Date(catalogue.createdAt).toLocaleDateString('fr-FR')}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => handleShareCatalogue(catalogue)}
                          title="Partager"
                        >
                          <ShareIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleGeneratePDF(catalogue.id)}
                          title="Générer PDF"
                        >
                          <PdfIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteCatalogue(catalogue.id)}
                          title="Supprimer"
                        >
                          <DeleteIcon fontSize="small" />
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

      {/* Create Catalogue Dialog */}
      <Dialog
        open={openCreateDialog}
        onClose={() => setOpenCreateDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Créer un nouveau catalogue</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Basic Info */}
            <Grid item xs={12}>
              <TextField
                label="Titre du catalogue"
                fullWidth
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </Grid>

            <Grid item xs={12}>
              <Autocomplete
                value={selectedClient}
                onChange={(_, newValue) => setSelectedClient(newValue)}
                options={clients?.data || []}
                getOptionLabel={(option) =>
                  option.companyName
                    ? `${option.companyName} - ${option.name}`
                    : option.name
                }
                renderOption={(props, option) => (
                  <li {...props}>
                    <Box>
                      <Typography variant="body1">
                        {option.companyName || option.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {option.email} {option.city ? `• ${option.city}` : ''}
                      </Typography>
                    </Box>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Sélectionner un client"
                    required
                    helperText="Sélectionnez le client pour ce catalogue"
                  />
                )}
                isOptionEqualToValue={(option, value) => option.id === value?.id}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Message personnalisé (optionnel)"
                fullWidth
                multiline
                rows={3}
                value={formData.customMessage}
                onChange={(e) => setFormData({ ...formData, customMessage: e.target.value })}
              />
            </Grid>

            {/* Advanced Candidate Selection */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom sx={{ mt: 2, mb: 2 }}>
                🔍 Recherche avancée de candidats
              </Typography>
              <CandidateAdvancedFilters
                onFiltersChange={setSearchFilters}
                onSearch={handleSearchCandidates}
                resultCount={foundCandidates.length}
              />

              {/* Quick action button to show all candidates */}
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant="contained"
                  color="success"
                  onClick={handleLoadAllCandidates}
                  sx={{ minWidth: 200 }}
                >
                  📋 Afficher TOUS les candidats ({foundCandidates.length})
                </Button>
              </Box>
            </Grid>

            {/* Found Candidates Results */}
            {foundCandidates.length > 0 && (
              <Grid item xs={12}>
                <Box sx={{ mt: 2, mb: 2 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="subtitle2" color="primary">
                      📋 Résultats de recherche ({foundCandidates.length} candidat{foundCandidates.length !== 1 ? 's' : ''})
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={handleAddAllCandidates}
                    >
                      Ajouter tous
                    </Button>
                  </Box>
                  <List sx={{ maxHeight: 300, overflow: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
                    {foundCandidates.map((candidate) => {
                      const isSelected = selectedCandidates.find((c) => c.id === candidate.id);
                      return (
                        <ListItem
                          key={candidate.id}
                          button
                          onClick={() => handleAddCandidate(candidate)}
                          disabled={!!isSelected}
                          sx={{
                            opacity: isSelected ? 0.5 : 1,
                            bgcolor: isSelected ? 'action.selected' : 'inherit',
                          }}
                        >
                          <ListItemText
                            primary={`${candidate.firstName} ${candidate.lastName}`}
                            secondary={`${candidate.city} - Note: ${candidate.globalRating || 'N/A'}/10 ${candidate.hasVehicle ? '🚗' : ''} ${candidate.hasBSP ? '🎓' : ''} ${candidate.cvUrl || candidate.cvStoragePath ? '📄' : ''}`}
                          />
                        </ListItem>
                      );
                    })}
                  </List>
                </Box>
              </Grid>
            )}

            {/* Selected Candidates */}
            {selectedCandidates.length > 0 && (
              <Grid item xs={12}>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" color="success.main" gutterBottom>
                    ✓ Candidats sélectionnés ({selectedCandidates.length})
                  </Typography>
                  <List sx={{ bgcolor: 'success.50', borderRadius: 1, maxHeight: 200, overflow: 'auto' }}>
                    {selectedCandidates.map((candidate) => (
                      <ListItem key={candidate.id}>
                        <ListItemText
                          primary={`${candidate.firstName} ${candidate.lastName}`}
                          secondary={`${candidate.city} - Note: ${candidate.globalRating || 'N/A'}/10`}
                        />
                        <ListItemSecondaryAction>
                          <IconButton
                            edge="end"
                            onClick={() => handleRemoveCandidate(candidate.id)}
                            size="small"
                          >
                            <CloseIcon />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                </Box>
              </Grid>
            )}

            {/* Configuration Options */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
                Options d'inclusion
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.includeSummary}
                        onChange={(e) =>
                          setFormData({ ...formData, includeSummary: e.target.checked })
                        }
                      />
                    }
                    label="Inclure le résumé"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.includeDetails}
                        onChange={(e) =>
                          setFormData({ ...formData, includeDetails: e.target.checked })
                        }
                      />
                    }
                    label="Inclure les détails"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.includeVideo}
                        onChange={(e) =>
                          setFormData({ ...formData, includeVideo: e.target.checked })
                        }
                      />
                    }
                    label="Inclure la vidéo"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.includeExperience}
                        onChange={(e) =>
                          setFormData({ ...formData, includeExperience: e.target.checked })
                        }
                      />
                    }
                    label="Inclure l'expérience"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.includeSituation}
                        onChange={(e) =>
                          setFormData({ ...formData, includeSituation: e.target.checked })
                        }
                      />
                    }
                    label="Inclure les tests"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.includeCV}
                        onChange={(e) =>
                          setFormData({ ...formData, includeCV: e.target.checked })
                        }
                        color="primary"
                      />
                    }
                    label="Inclure les CVs ⭐"
                    sx={{ fontWeight: 'bold' }}
                  />
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCreateDialog(false)}>Annuler</Button>
          <Button
            variant="contained"
            onClick={handleCreateCatalogue}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? <CircularProgress size={24} /> : 'Créer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Share Catalogue Dialog */}
      {selectedCatalogueForShare && (
        <ShareCatalogueDialog
          open={openShareDialog}
          onClose={handleCloseShareDialog}
          catalogue={selectedCatalogueForShare}
        />
      )}
    </Box>
  );
}
