import { Suspense, useEffect, useState } from 'react';
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
  Alert,
  Pagination,
  Checkbox,
  Collapse,
  Autocomplete,
  FormControlLabel,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  Cancel as CancelIcon,
  Map as MapIcon,
  FileDownload as FileDownloadIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';
import { candidateService } from '@/services/candidate.service';
import { TableSkeleton } from '@/components/skeletons';
import { catalogueService } from '@/services/catalogue.service';
import { clientService } from '@/services/client.service';
import { lazy } from 'react';
const InterviewEvaluationForm = lazy(() => import('@/components/InterviewEvaluationForm'));
const CandidatesMap = lazy(() => import('@/components/map/CandidatesMap'));
import CandidateFiltersBar from './components/CandidateFiltersBar';
import CandidateTableRow from './components/CandidateTableRow';
import CandidateBulkActions from './components/CandidateBulkActions';
import { candidateFormSchema } from '@/validation/candidate';

export default function CandidatesListPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const renderLazyFallback = (minHeight = 240) => (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight={minHeight}>
      <CircularProgress />
    </Box>
  );
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

  // Export state
  const [isExporting, setIsExporting] = useState(false);

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

  // Handle CSV export
  const handleExportCSV = async () => {
    try {
      setIsExporting(true);

      // Build params with current filters
      const exportParams = {
        search: debouncedSearch || undefined,
        ...filters,
        includeArchived,
        sortBy,
        sortOrder,
      };

      const blob = await candidateService.exportCandidatesCSV(exportParams);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `candidats_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      enqueueSnackbar('Export CSV réussi', { variant: 'success' });
    } catch (error) {
      console.error('Error exporting CSV:', error);
      enqueueSnackbar('Erreur lors de l\'export CSV', { variant: 'error' });
    } finally {
      setIsExporting(false);
    }
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
    const validationResult = candidateFormSchema.safeParse(formData);

    if (!validationResult.success) {
      const firstIssue = validationResult.error.issues[0];
      enqueueSnackbar(firstIssue?.message || 'Les informations saisies sont invalides.', { variant: 'error' });
      return;
    }

    const safeValues = validationResult.data;

    const candidateData = {
      // Personal info
      firstName: safeValues.firstName,
      lastName: safeValues.lastName,
      email: safeValues.email,
      phone: safeValues.phone,
      address: safeValues.address,
      city: safeValues.city,
      postalCode: safeValues.postalCode,
      interviewDate: safeValues.interviewDate,

      // Transport
      hasVehicle: safeValues.hasVehicle,
      hasDriverLicense: safeValues.hasDriverLicense,
      driverLicenseClass: safeValues.driverLicenseClass,
      driverLicenseNumber: safeValues.driverLicenseNumber,
      canTravelKm: safeValues.canTravelKm,

      // Certifications
      hasBSP: safeValues.hasBSP,
      bspNumber: safeValues.bspNumber,
      bspExpiryDate: safeValues.bspExpiryDate,
      bspStatus: safeValues.bspStatus,

      // Ratings
      professionalismRating: safeValues.professionalismRating,
      communicationRating: safeValues.communicationRating,
      appearanceRating: safeValues.appearanceRating,
      motivationRating: safeValues.motivationRating,
      experienceRating: safeValues.experienceRating,
      globalRating: safeValues.globalRating,

      // Notes
      hrNotes: safeValues.hrNotes,
      strengths: safeValues.strengths,
      weaknesses: safeValues.weaknesses,

      // Nested data
      languages: safeValues.languages,
      experiences: safeValues.experiences,
      certifications: safeValues.certifications,

      situationTests: [
        safeValues.situationTest1 && { question: 'Conflit avec un collegue', answer: safeValues.situationTest1 },
        safeValues.situationTest2 && { question: 'Situation d\'urgence inattendue', answer: safeValues.situationTest2 },
        safeValues.situationTest3 && { question: 'Assurer la securite d\'un site', answer: safeValues.situationTest3 },
      ].filter(Boolean),
    };

    if (editingCandidate) {
      updateMutation.mutate({ id: editingCandidate.id, data: candidateData });
    } else {
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
    const situationTest1 = situationTests.find((t: any) => t.question?.includes('collègue') || t.question?.includes('collegue'))?.answer || '';
    const situationTest2 = situationTests.find((t: any) => t.question?.includes('urgence'))?.answer || '';
    const situationTest3 = situationTests.find((t: any) => t.question?.includes('sécurité') || t.question?.includes('securite'))?.answer || '';

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
    return <TableSkeleton rows={10} columns={8} hasHeader hasFilters hasActions />;
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
            startIcon={<FileDownloadIcon />}
            onClick={handleExportCSV}
            disabled={isExporting || isLoading}
          >
            {isExporting ? 'Export en cours...' : 'Exporter CSV'}
          </Button>
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
          <Suspense fallback={renderLazyFallback(200)}>
            <CandidatesMap onCityClick={handleCityClick} />
          </Suspense>
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
          <Suspense fallback={renderLazyFallback(320)}>
            <InterviewEvaluationForm
              onSubmit={handleSaveCandidate}
              onCancel={handleCloseDialog}
              isSubmitting={createMutation.isPending || updateMutation.isPending}
              initialData={editingCandidate ? transformCandidateToFormData(editingCandidate) : undefined}
              candidateId={editingCandidate?.id}
            />
          </Suspense>
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
