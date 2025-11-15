import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
  Checkbox,
  Collapse,
  Autocomplete,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  Cancel as CancelIcon,
  Map as MapIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';
import { candidateService } from '@/services/candidate.service';
import { catalogueService } from '@/services/catalogue.service';
import { clientService } from '@/services/client.service';
import InterviewEvaluationForm from '@/components/InterviewEvaluationForm';
import CandidatesMap from '@/components/map/CandidatesMap';
import CandidateFiltersBar from './components/CandidateFiltersBar';
import CandidateTableRow from './components/CandidateTableRow';
import CandidateBulkActions from './components/CandidateBulkActions';

export default function CandidatesListPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // Search and filter states
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState(''); // Debounced value for API calls
  const [showFilters, setShowFilters] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    minRating: '',
    city: '',
    hasVideo: '',
    interviewDateStart: '',
    interviewDateEnd: '',
    certification: '',
  });
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Autocomplete states
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [candidateSuggestions, setCandidateSuggestions] = useState<Array<{ id: string; label: string; email: string }>>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // Local input states for debouncing (to prevent page refresh on every keystroke)
  const [cityInput, setCityInput] = useState('');

  // Selection and catalogue creation states
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [openCatalogueDialog, setOpenCatalogueDialog] = useState(false);
  const [catalogueForm, setCatalogueForm] = useState({
    title: '',
    customMessage: '',
    includeSummary: true,
    includeDetails: true,
    includeVideo: true,
    includeExperience: true,
    includeSituation: true,
    includeCV: true,
  });
  const [selectedClient, setSelectedClient] = useState<any>(null);

  // Debounce search input (300ms delay to avoid spamming API)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  // Fetch clients
  const { data: clientsData } = useQuery({
    queryKey: ['clients', 'active'],
    queryFn: () => clientService.getClients({ isActive: true, limit: 1000 }),
  });

  // Fetch candidates with debounced search and keepPreviousData to prevent UI flashing
  const { data, isLoading, error } = useQuery({
    queryKey: ['candidates', page, pageSize, debouncedSearch, filters, sortBy, sortOrder, includeArchived],
    queryFn: () =>
      candidateService.getCandidates({
        page,
        limit: pageSize,
        search: debouncedSearch || undefined,
        status: filters.status || undefined,
        minRating: filters.minRating ? Number(filters.minRating) : undefined,
        city: filters.city || undefined,
        hasVideo: filters.hasVideo === '' ? undefined : filters.hasVideo === 'true',
        interviewDateStart: filters.interviewDateStart || undefined,
        interviewDateEnd: filters.interviewDateEnd || undefined,
        includeArchived: includeArchived || undefined,
        certification: filters.certification || undefined,
        sortBy,
        sortOrder,
      }),
    placeholderData: keepPreviousData, // Keep previous results while fetching new data
  });

  // Handle sort change
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  // Handle filter change
  const handleFilterChange = (field: string, value: any) => {
    setFilters({ ...filters, [field]: value });
    setPage(1);
  };

  // Handle city click from map
  const handleCityClick = (city: string) => {
    setFilters({ ...filters, city });
    setCityInput(city); // Update local input for autocomplete
    setShowMap(false); // Hide map after filtering
    setPage(1);
    enqueueSnackbar(`Filtré par ville: ${city}`, { variant: 'info' });
  };

  // Clear all filters
  const clearFilters = () => {
    setSearch('');
    setCityInput(''); // Clear local city input
    setFilters({
      status: '',
      minRating: '',
      city: '',
      hasVideo: '',
      interviewDateStart: '',
      interviewDateEnd: '',
      certification: '',
    });
    setPage(1);
  };

  // Fetch city suggestions
  const fetchCitySuggestions = async (query: string) => {
    if (!query) {
      try {
        setLoadingCities(true);
        const response = await candidateService.getCitiesSuggestions();
        setCitySuggestions(response.data || []);
      } catch (error) {
        console.error('Error fetching city suggestions:', error);
      } finally {
        setLoadingCities(false);
      }
      return;
    }

    try {
      setLoadingCities(true);
      const response = await candidateService.getCitiesSuggestions(query);
      setCitySuggestions(response.data || []);
    } catch (error) {
      console.error('Error fetching city suggestions:', error);
    } finally {
      setLoadingCities(false);
    }
  };

  // Fetch candidate suggestions
  const fetchCandidateSuggestions = async (query: string) => {
    if (!query || query.length < 2) {
      setCandidateSuggestions([]);
      return;
    }

    try {
      setLoadingCandidates(true);
      const response = await candidateService.getCandidatesSuggestions(query);
      setCandidateSuggestions(response.data || []);
    } catch (error) {
      console.error('Error fetching candidate suggestions:', error);
    } finally {
      setLoadingCandidates(false);
    }
  };

  // Debounce city filter to prevent page refresh on every keystroke
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setFilters(prev => ({ ...prev, city: cityInput }));
      setPage(1);
    }, 500); // Wait 500ms after user stops typing

    return () => clearTimeout(timeoutId);
  }, [cityInput]);

  // Create candidate mutation
  const createMutation = useMutation({
    mutationFn: candidateService.createCandidate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      enqueueSnackbar('Candidat ajouté avec succès !', { variant: 'success' });
      setOpenAddDialog(false);
      setEditingCandidate(null);
      setPage(1); // Retour à la première page
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.error || 'Erreur lors de l\'ajout', {
        variant: 'error',
      });
    },
  });

  // Update candidate mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      candidateService.updateCandidate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      enqueueSnackbar('Candidat modifié avec succès !', { variant: 'success' });
      setOpenAddDialog(false);
      setEditingCandidate(null);
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.error || 'Erreur lors de la modification', {
        variant: 'error',
      });
    },
  });

  // Delete candidate mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => candidateService.deleteCandidate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      enqueueSnackbar('Candidat supprimé avec succès !', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.error || 'Erreur lors de la suppression', {
        variant: 'error',
      });
    },
  });

  // Archive candidate mutation
  const archiveMutation = useMutation({
    mutationFn: (id: string) => candidateService.archiveCandidate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      enqueueSnackbar('Candidat archivé avec succès !', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.error || 'Erreur lors de l\'archivage', {
        variant: 'error',
      });
    },
  });

  // Unarchive candidate mutation
  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => candidateService.unarchiveCandidate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      enqueueSnackbar('Candidat désarchivé avec succès !', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.error || 'Erreur lors de la désarchivage', {
        variant: 'error',
      });
    },
  });

  // Create catalogue mutation
  const createCatalogueMutation = useMutation({
    mutationFn: catalogueService.createCatalogue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogues'] });
      enqueueSnackbar('Catalogue créé avec succès !', { variant: 'success' });
      setOpenCatalogueDialog(false);
      setSelectedCandidates(new Set());
      setSelectedClient(null);
      setCatalogueForm({
        title: '',
        customMessage: '',
        includeSummary: true,
        includeDetails: true,
        includeVideo: true,
        includeExperience: true,
        includeSituation: true,
        includeCV: true,
      });
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error || 'Erreur lors de la création du catalogue',
        { variant: 'error' }
      );
    },
  });

  const handleSaveCandidate = (formData: any) => {
    // Transform the form data to match the API structure
    const candidateData = {
      // Personal info
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
      city: formData.city,
      postalCode: formData.postalCode,
      interviewDate: formData.interviewDate,

      // Transport
      hasVehicle: formData.hasVehicle,
      hasDriverLicense: formData.hasDriverLicense,
      driverLicenseClass: formData.driverLicenseClass,
      driverLicenseNumber: formData.driverLicenseNumber,
      canTravelKm: formData.canTravelKm,

      // Certifications
      hasBSP: formData.hasBSP,
      bspNumber: formData.bspNumber,
      bspExpiryDate: formData.bspExpiryDate,
      bspStatus: formData.bspStatus,

      // Ratings
      professionalismRating: formData.professionalismRating,
      communicationRating: formData.communicationRating,
      appearanceRating: formData.appearanceRating,
      motivationRating: formData.motivationRating,
      experienceRating: formData.experienceRating,
      globalRating: formData.globalRating,

      // Notes
      hrNotes: formData.hrNotes,
      strengths: formData.strengths,
      weaknesses: formData.weaknesses,

      // Nested data
      languages: formData.languages,
      experiences: formData.experiences,
      certifications: formData.certifications,

      // We'll need to create situationTests from the three text fields
      situationTests: [
        formData.situationTest1 && { scenario: 'Conflit avec un collègue', response: formData.situationTest1 },
        formData.situationTest2 && { scenario: 'Situation d\'urgence inattendue', response: formData.situationTest2 },
        formData.situationTest3 && { scenario: 'Assurer la sécurité d\'un site', response: formData.situationTest3 },
      ].filter(Boolean),
    };

    if (editingCandidate) {
      // Update existing candidate
      updateMutation.mutate({ id: editingCandidate.id, data: candidateData });
    } else {
      // Create new candidate
      createMutation.mutate(candidateData);
    }
  };

  const handleEditCandidate = async (candidateId: string) => {
    try {
      // Fetch full candidate data
      const response = await candidateService.getCandidateById(candidateId);
      const candidate = response.data;
      setEditingCandidate(candidate);
      setOpenAddDialog(true);
    } catch (error) {
      enqueueSnackbar('Erreur lors du chargement du candidat', { variant: 'error' });
    }
  };

  const handleCloseDialog = () => {
    setOpenAddDialog(false);
    setEditingCandidate(null);
  };

  const transformCandidateToFormData = (candidate: any) => {
    // Extract situation tests responses
    const situationTests = candidate.situationTests || [];
    const situationTest1 = situationTests.find((t: any) => t.scenario?.includes('collègue'))?.response || '';
    const situationTest2 = situationTests.find((t: any) => t.scenario?.includes('urgence'))?.response || '';
    const situationTest3 = situationTests.find((t: any) => t.scenario?.includes('sécurité'))?.response || '';

    return {
      // Personal info
      firstName: candidate.firstName || '',
      lastName: candidate.lastName || '',
      email: candidate.email || '',
      phone: candidate.phone || '',
      address: candidate.address || '',
      city: candidate.city || '',
      postalCode: candidate.postalCode || '',
      interviewDate: candidate.interviewDate ? new Date(candidate.interviewDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],

      // Transport
      hasVehicle: candidate.hasVehicle || false,
      hasDriverLicense: candidate.hasDriverLicense || false,
      driverLicenseClass: candidate.driverLicenseClass || '',
      driverLicenseNumber: candidate.driverLicenseNumber || '',
      canTravelKm: candidate.canTravelKm || 50,

      // Certifications
      hasBSP: candidate.hasBSP || false,
      bspNumber: candidate.bspNumber || '',
      bspExpiryDate: candidate.bspExpiryDate ? new Date(candidate.bspExpiryDate).toISOString().split('T')[0] : '',
      bspStatus: candidate.bspStatus || '',

      // Availability (we don't have these in the database yet, so default to false)
      availableDay: false,
      availableEvening: false,
      availableNight: false,
      availableWeekend: false,
      canWorkUrgent: candidate.canWorkUrgent || false,

      // Languages
      languages: candidate.languages || [],

      // Certifications
      certifications: candidate.certifications || [],

      // Ratings
      professionalismRating: candidate.professionalismRating || 7,
      communicationRating: candidate.communicationRating || 7,
      appearanceRating: candidate.appearanceRating || 7,
      motivationRating: candidate.motivationRating || 7,
      experienceRating: candidate.experienceRating || 7,
      globalRating: candidate.globalRating || 7,

      // Experiences
      experiences: candidate.experiences || [],

      // Situation tests
      situationTest1,
      situationTest2,
      situationTest3,

      // Strengths & Weaknesses
      strengths: candidate.strengths || '',
      weaknesses: candidate.weaknesses || '',

      // HR Notes
      hrNotes: candidate.hrNotes || '',
    };
  };

  // Selection handlers
  const handleSelectCandidate = (candidateId: string) => {
    const newSelection = new Set(selectedCandidates);
    if (newSelection.has(candidateId)) {
      newSelection.delete(candidateId);
    } else {
      newSelection.add(candidateId);
    }
    setSelectedCandidates(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedCandidates.size === candidates.length) {
      setSelectedCandidates(new Set());
    } else {
      setSelectedCandidates(new Set(candidates.map((c: any) => c.id)));
    }
  };

  const handleDeselectAll = () => {
    setSelectedCandidates(new Set());
  };

  const handleCreateCatalogue = () => {
    if (!catalogueForm.title || !selectedClient) {
      enqueueSnackbar('Veuillez remplir le titre et sélectionner un client', { variant: 'warning' });
      return;
    }

    if (selectedCandidates.size === 0) {
      enqueueSnackbar('Veuillez sélectionner au moins un candidat', { variant: 'warning' });
      return;
    }

    const payload = {
      ...catalogueForm,
      clientId: selectedClient.id,
      candidateIds: Array.from(selectedCandidates),
    };

    createCatalogueMutation.mutate(payload);
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
        Erreur lors du chargement des candidats. Veuillez réessayer.
      </Alert>
    );
  }

  const candidates = data?.data || [];

  return (
    <Box>
      {/* Bulk Actions Bar */}
      <CandidateBulkActions
        selectedCount={selectedCandidates.size}
        onCreateCatalogue={() => setOpenCatalogueDialog(true)}
        onClearSelection={handleDeselectAll}
      />

      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">
          Candidats ({data?.pagination.total || 0})
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<MapIcon />}
            onClick={() => setShowMap(!showMap)}
          >
            {showMap ? 'Masquer carte' : 'Afficher carte'}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenAddDialog(true)}
          >
            Ajouter un candidat
          </Button>
        </Box>
      </Box>

      {/* Map */}
      <Collapse in={showMap}>
        <Box sx={{ mb: 3 }}>
          <CandidatesMap onCityClick={handleCityClick} />
        </Box>
      </Collapse>

      {/* Search and Filters */}
      <CandidateFiltersBar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        filters={filters}
        onFilterChange={handleFilterChange}
        includeArchived={includeArchived}
        onIncludeArchivedChange={(value) => {
          setIncludeArchived(value);
          setPage(1);
        }}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
        candidateSuggestions={candidateSuggestions}
        loadingCandidates={loadingCandidates}
        onFetchCandidateSuggestions={fetchCandidateSuggestions}
        citySuggestions={citySuggestions}
        cityInput={cityInput}
        onCityInputChange={setCityInput}
      />

      <Card>
        <CardContent>
          {candidates.length === 0 ? (
            <Box textAlign="center" py={4}>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                Aucun candidat trouvé
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Commencez par ajouter votre premier candidat !
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setOpenAddDialog(true)}
              >
                Ajouter un candidat
              </Button>
            </Box>
          ) : (
            <TableContainer component={Paper} elevation={0}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        indeterminate={selectedCandidates.size > 0 && selectedCandidates.size < candidates.length}
                        checked={candidates.length > 0 && selectedCandidates.size === candidates.length}
                        onChange={handleSelectAll}
                      />
                    </TableCell>
                    <TableCell
                      sx={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('firstName')}
                    >
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <strong>Nom</strong>
                        {sortBy === 'firstName' && (
                          sortOrder === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell><strong>Téléphone</strong></TableCell>
                    <TableCell><strong>Ville</strong></TableCell>
                    <TableCell
                      sx={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('interviewDate')}
                    >
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <strong>Date d'entrevue</strong>
                        {sortBy === 'interviewDate' && (
                          sortOrder === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell><strong>Statut</strong></TableCell>
                    <TableCell
                      sx={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('globalRating')}
                    >
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <strong>Note</strong>
                        {sortBy === 'globalRating' && (
                          sortOrder === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell><strong>Avis RH</strong></TableCell>
                    <TableCell align="center"><strong>CV</strong></TableCell>
                    <TableCell><strong>BSP</strong></TableCell>
                    <TableCell align="right"><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {candidates.map((candidate: any) => (
                    <CandidateTableRow
                      key={candidate.id}
                      candidate={candidate}
                      isSelected={selectedCandidates.has(candidate.id)}
                      onSelect={() => handleSelectCandidate(candidate.id)}
                      onView={() => navigate(`/candidates/${candidate.id}`)}
                      onEdit={() => handleEditCandidate(candidate.id)}
                      onArchive={() => archiveMutation.mutate(candidate.id)}
                      onUnarchive={() => unarchiveMutation.mutate(candidate.id)}
                      onDelete={() => deleteMutation.mutate(candidate.id)}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Pagination */}
          {candidates.length > 0 && data?.pagination && (
            <Box display="flex" justifyContent="center" alignItems="center" mt={3} gap={2}>
              <Typography variant="body2" color="text.secondary">
                Page {data.pagination.page} sur {data.pagination.totalPages} ({data.pagination.total} candidats au total)
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

      {/* Interview Evaluation Dialog */}
      <Dialog
        open={openAddDialog}
        onClose={handleCloseDialog}
        maxWidth="lg"
        fullWidth
        fullScreen
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h5">
              {editingCandidate ? '✏️ Modifier le candidat' : '📋 Feuille d\'évaluation d\'entrevue'}
            </Typography>
            <IconButton edge="end" onClick={handleCloseDialog}>
              <CancelIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <InterviewEvaluationForm
            onSubmit={handleSaveCandidate}
            onCancel={handleCloseDialog}
            isSubmitting={createMutation.isPending || updateMutation.isPending}
            initialData={editingCandidate ? transformCandidateToFormData(editingCandidate) : undefined}
            candidateId={editingCandidate?.id}
          />
        </DialogContent>
      </Dialog>

      {/* Catalogue Creation Dialog */}
      <Dialog
        open={openCatalogueDialog}
        onClose={() => setOpenCatalogueDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Créer un catalogue avec {selectedCandidates.size} candidat{selectedCandidates.size !== 1 ? 's' : ''}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Titre du catalogue"
                required
                value={catalogueForm.title}
                onChange={(e) => setCatalogueForm({ ...catalogueForm, title: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                value={selectedClient}
                onChange={(_, newValue) => setSelectedClient(newValue)}
                options={clientsData?.data || []}
                getOptionLabel={(option) =>
                  option.companyName
                    ? `${option.companyName} - ${option.name}`
                    : option.name
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Sélectionner un client"
                    required
                  />
                )}
                isOptionEqualToValue={(option, value) => option.id === value?.id}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Message personnalisé (optionnel)"
                multiline
                rows={3}
                value={catalogueForm.customMessage}
                onChange={(e) => setCatalogueForm({ ...catalogueForm, customMessage: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Options d'inclusion
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={catalogueForm.includeSummary}
                        onChange={(e) => setCatalogueForm({ ...catalogueForm, includeSummary: e.target.checked })}
                      />
                    }
                    label="Résumé"
                  />
                </Grid>
                <Grid item xs={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={catalogueForm.includeDetails}
                        onChange={(e) => setCatalogueForm({ ...catalogueForm, includeDetails: e.target.checked })}
                      />
                    }
                    label="Détails"
                  />
                </Grid>
                <Grid item xs={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={catalogueForm.includeVideo}
                        onChange={(e) => setCatalogueForm({ ...catalogueForm, includeVideo: e.target.checked })}
                      />
                    }
                    label="Vidéo"
                  />
                </Grid>
                <Grid item xs={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={catalogueForm.includeExperience}
                        onChange={(e) => setCatalogueForm({ ...catalogueForm, includeExperience: e.target.checked })}
                      />
                    }
                    label="Expérience"
                  />
                </Grid>
                <Grid item xs={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={catalogueForm.includeSituation}
                        onChange={(e) => setCatalogueForm({ ...catalogueForm, includeSituation: e.target.checked })}
                      />
                    }
                    label="Situation"
                  />
                </Grid>
                <Grid item xs={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={catalogueForm.includeCV}
                        onChange={(e) => setCatalogueForm({ ...catalogueForm, includeCV: e.target.checked })}
                      />
                    }
                    label="CV"
                  />
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCatalogueDialog(false)}>
            Annuler
          </Button>
          <Button
            onClick={handleCreateCatalogue}
            variant="contained"
            disabled={createCatalogueMutation.isPending}
          >
            {createCatalogueMutation.isPending ? 'Création...' : 'Créer le catalogue'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
