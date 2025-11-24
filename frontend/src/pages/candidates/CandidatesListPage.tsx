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
  Tooltip,
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
import { adminService } from '@/services/admin.service';
import { TableSkeleton } from '@/components/skeletons';
import { catalogueService } from '@/services/catalogue.service';
import { clientService } from '@/services/client.service';
import { useAuthStore } from '@/store/authStore';
import { lazy } from 'react';
const InterviewEvaluationForm = lazy(() => import('@/components/InterviewEvaluationForm'));
const CandidatesMap = lazy(() => import('@/components/map/CandidatesMap'));
import CandidateFiltersBar from './components/CandidateFiltersBar';
import CandidateBulkActions from './components/CandidateBulkActions';
import CandidatesTable from './components/CandidatesTable';
import CreateCatalogueDialog from './components/CreateCatalogueDialog';
import { candidateFormSchema } from '@/validation/candidate';
import { HelpDialog } from '@/components/HelpDialog';

const CANDIDATES_HELP_SECTIONS = [
  {
    title: 'Gestion quotidienne',
    bullets: [
      'Utilisez la recherche deboucee pour filtrer sans rechargements incessants.',
      'Les filtres avances permettent de cibler certifications, villes et notes minimales.',
      'Les actions groupees declenchent la creation de catalogues et la selection rapide.',
    ],
  },
  {
    title: 'Exports et partage',
    bullets: [
      'Le bouton Export CSV respecte vos filtres actifs et l\'ordre de tri.',
      'Les catalogues clients incluent uniquement les candidats selectionnes.',
      'Affichez la carte pour filtrer en cliquant directement sur une ville.',
    ],
  },
];

const CANDIDATES_HELP_FAQ = [
  {
    question: 'Pourquoi certains candidats sont manquants dans l\'export ?',
    answer: 'Assurez-vous d\'inclure les archives si necessaire et verifiez que le filtre de recherche est vide.',
  },
  {
    question: 'Comment partager une selection avec un client ?',
    answer: 'Selectionnez les candidats, ouvrez "Actions groupees" puis creez un catalogue en choisissant le client cible.',
  },
];

const CANDIDATE_FORM_HELP_SECTIONS = [
  {
    title: 'Champs critiques',
    bullets: [
      'Courriel, telephone et evaluation doivent etre completes avant enregistrement.',
      'Les reponses aux tests de situation sont reinterpretees automatiquement dans le format attendu.',
      'Renseignez licences BSP et permis de conduire pour faciliter les recherches ulterieures.',
    ],
  },
  {
    title: 'Conseils pratiques',
    bullets: [
      "Utilisez les notes RH pour conserver le contexte de l'entrevue.",
      "Ajoutez forces et faiblesses afin d'alimenter les catalogues clients.",
    ],
  },
];

const CANDIDATE_FORM_HELP_FAQ = [
  {
    question: 'Pourquoi le formulaire refuse ma soumission ?',
    answer: 'Un champ obligatoire est probablement vide ou mal formate (date, e-mail). Verifiez chaque section avant de reessayer.',
  },
  {
    question: 'Comment conserver les anciennes notes ?',
    answer: "Les notes RH restent sur le candidat apres sauvegarde. Ajoutez un recap dans la section dediee pour suivre l'historique.",
  },
];

const CATALOGUE_HELP_SECTIONS = [
  {
    title: 'Avant de generer',
    bullets: [
      'Selectionnez au moins un candidat et choisissez le client cible.',
      'Personnalisez le message pour contextualiser l\'envoi.',
      'Desactivez les sections inutiles (video, experience, CV) pour alleger le document.',
    ],
  },
];


export default function CandidatesListPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
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
        status: filters.status || undefined,
        minRating: filters.minRating ? Number(filters.minRating) : undefined,
        city: filters.city || undefined,
        hasVideo: filters.hasVideo === '' ? undefined : filters.hasVideo === 'true',
        interviewDateStart: filters.interviewDateStart || undefined,
        interviewDateEnd: filters.interviewDateEnd || undefined,
        certification: filters.certification || undefined,
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
      enqueueSnackbar('Impossible de generer le CSV avec les filtres actuels', { variant: 'error' });
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
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      const fullName = `${variables?.firstName || ''} ${variables?.lastName || ''}`.trim() || 'Nouveau candidat';
      enqueueSnackbar(`${fullName} ajoute a la base`, { variant: 'success' });
      setOpenAddDialog(false);
      setEditingCandidate(null);
      setPage(1); // Retour a la premiere page
    },
    onError: (error: any) => {
      console.error('Erreur creation candidat:', error);
      const serverError = error.response?.data?.error;
      const validationError = error.response?.data?.message;
      const details = error.response?.data?.details;

      let errorMessage = serverError || validationError || 'Impossible d\'ajouter ce candidat.';

      if (Array.isArray(details) && details.length > 0) {
        const detailMessages = details.map((d: any) => `${d.field}: ${d.message}`).join(', ');
        errorMessage += ` (${detailMessages})`;
      }

      enqueueSnackbar(errorMessage, {
        variant: 'error',
        autoHideDuration: 10000,
      });
    },
  });

  // Update candidate mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      candidateService.updateCandidate(id, data),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      const fullName = `${variables.data?.firstName || ''} ${variables.data?.lastName || ''}`.trim() || 'Candidat';
      enqueueSnackbar(`${fullName} mis a jour`, { variant: 'success' });
      setOpenAddDialog(false);
      setEditingCandidate(null);
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.error || 'Impossible de mettre a jour ce candidat.', {
        variant: 'error',
      });
    },
  });

  // Delete candidate mutation
  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: string; label?: string }) => candidateService.deleteCandidate(id),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      const label = variables?.label || `ID ${variables?.id}`;
      enqueueSnackbar(`${label} supprime de la base`, { variant: 'success' });
    },
    onError: (error: any, variables) => {
      const label = variables?.label || `ID ${variables?.id}`;
      enqueueSnackbar(error.response?.data?.error || `Impossible de supprimer ${label}`, {
        variant: 'error',
      });
    },
  });

  // Archive candidate mutation
  const archiveMutation = useMutation({
    mutationFn: ({ id }: { id: string; label?: string }) => candidateService.archiveCandidate(id),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      const label = variables?.label || `ID ${variables?.id}`;
      enqueueSnackbar(`${label} archive`, { variant: 'success' });
    },
    onError: (error: any, variables) => {
      const label = variables?.label || `ID ${variables?.id}`;
      enqueueSnackbar(error.response?.data?.error || `Impossible d'archiver ${label}`, {
        variant: 'error',
      });
    },
  });

  // Unarchive candidate mutation
  const unarchiveMutation = useMutation({
    mutationFn: ({ id }: { id: string; label?: string }) => candidateService.unarchiveCandidate(id),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      const label = variables?.label || `ID ${variables?.id}`;
      enqueueSnackbar(`${label} reactive`, { variant: 'success' });
    },
    onError: (error: any, variables) => {
      const label = variables?.label || `ID ${variables?.id}`;
      enqueueSnackbar(error.response?.data?.error || `Impossible de desarchiver ${label}`, {
        variant: 'error',
      });
    },
  });

  // Revert candidate to prospect mutation (ADMIN ONLY)
  const revertToProspectMutation = useMutation({
    mutationFn: ({ id }: { id: string; label?: string }) => adminService.revertCandidateToProspect(id),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
      const label = variables?.label || `ID ${variables?.id}`;
      enqueueSnackbar(`${label} re-converti en candidat potentiel avec succes`, { variant: 'success' });
    },
    onError: (error: any, variables) => {
      const label = variables?.label || `ID ${variables?.id}`;
      enqueueSnackbar(error.response?.data?.error || `Impossible de re-convertir ${label}`, {
        variant: 'error',
      });
    },
  });

  // Create catalogue mutation
  const createCatalogueMutation = useMutation({
    mutationFn: catalogueService.createCatalogue,
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['catalogues'] });
      enqueueSnackbar(`Catalogue "${variables?.title || 'Sans titre'}" créé avec succès`, {
        variant: 'success',
      });
      setOpenCatalogueDialog(false);
      setSelectedCandidates(new Set());
    },
    onError: (error: any, variables) => {
      const label = variables?.title || 'Sans titre';
      enqueueSnackbar(
        error.response?.data?.error || `Impossible de creer le catalogue "${label}"`,
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

    // Construct availabilities array from boolean flags
    const availabilities = [];
    if (formData.availableDay) availabilities.push({ type: 'JOUR', isAvailable: true });
    if (formData.availableEvening) availabilities.push({ type: 'SOIR', isAvailable: true });
    if (formData.availableNight) availabilities.push({ type: 'NUIT', isAvailable: true });
    if (formData.availableWeekend) availabilities.push({ type: 'FIN_DE_SEMAINE', isAvailable: true });

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
      availabilities: availabilities.length > 0 ? availabilities : undefined,
      canWorkUrgent: formData.canWorkUrgent, // Add urgency flag

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

  const handleExtractSkills = async (candidate: any) => {
    try {
      enqueueSnackbar('Extraction des compétences en cours (IA)...', { variant: 'info' });
      const result = await candidateService.extractSkills(candidate.id);

      if (result.success) {
        const count = result.skillsFound?.length || 0;
        enqueueSnackbar(`${count} compétences extraites avec succès`, { variant: 'success' });
        queryClient.invalidateQueries({ queryKey: ['candidates'] });
      } else {
        enqueueSnackbar(`Erreur: ${result.errorMessage || 'Extraction échouée'}`, { variant: 'error' });
      }
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.error || 'Erreur lors de l\'extraction', { variant: 'error' });
      console.error(error);
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
      enqueueSnackbar(`Impossible de charger le candidat ${candidateId}. Reessayez ou verifiez son statut.`, { variant: 'error' });
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

  const handleCreateCatalogue = (clientId: string, formData: any) => {
    if (selectedCandidates.size === 0) {
      enqueueSnackbar('Veuillez sélectionner au moins un candidat', { variant: 'warning' });
      return;
    }

    const payload = {
      ...formData,
      clientId,
      candidateIds: Array.from(selectedCandidates),
    };

    createCatalogueMutation.mutate(payload);
  };

  // Revert BATCH candidates to prospects (ADMIN ONLY)
  const revertBatchToProspectMutation = useMutation({
    mutationFn: (ids: string[]) => adminService.revertBatchCandidatesToProspects(ids),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
      enqueueSnackbar(response.message, { variant: 'success' });
      setSelectedCandidates(new Set()); // Clear selection
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.error || 'Impossible de re-convertir les candidats sélectionnés', {
        variant: 'error',
      });
    },
  });

  const handleRevertBatch = () => {
    if (selectedCandidates.size === 0) return;

    if (window.confirm(`Êtes-vous sûr de vouloir re-convertir ces ${selectedCandidates.size} candidats en prospects ?\nIls seront retirés de la liste des candidats.`)) {
      revertBatchToProspectMutation.mutate(Array.from(selectedCandidates));
    }
  };

  if (isLoading) {
    return <TableSkeleton rows={10} columns={8} hasHeader hasFilters hasActions />;
  }

  if (error) {
    return (
      <Alert severity="error">
        Impossible de charger la liste des candidats. Verifiez votre connexion puis reessayez.
      </Alert>
    );
  }

  const candidates = data?.data || [];

  return (
    <Box>
      {/* Bulk Actions Bar */}
      < CandidateBulkActions
        selectedCount={selectedCandidates.size}
        onCreateCatalogue={() => setOpenCatalogueDialog(true)
        }
        onClearSelection={handleDeselectAll}
        onRevertToProspect={user?.role === 'ADMIN' ? handleRevertBatch : undefined}
      />

      < Box display="flex" justifyContent="space-between" alignItems="center" mb={3} >
        <Typography variant="h4" fontWeight="bold">
          Candidats ({data?.pagination.total || 0})
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <HelpDialog
            title="Guide liste candidats"
            subtitle="Filtres, exports et actions groupées"
            sections={CANDIDATES_HELP_SECTIONS}
            faq={CANDIDATES_HELP_FAQ}
            triggerLabel="Guide & FAQ"
          />
          <Tooltip title="Exporter les candidats visibles avec les filtres actifs">
            <span>
              <Button
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                onClick={handleExportCSV}
                disabled={isExporting || isLoading}
              >
                {isExporting ? 'Export en cours...' : 'Exporter CSV'}
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Afficher la carte pour filtrer par ville">
            <span>
              <Button
                variant="outlined"
                startIcon={<MapIcon />}
                onClick={() => setShowMap(!showMap)}
              >
                {showMap ? 'Masquer carte' : 'Afficher carte'}
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Ajouter manuellement un nouveau candidat">
            <span>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setOpenAddDialog(true)}
              >
                Ajouter un candidat
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box >

      {/* Map */}
      < Collapse in={showMap}>
        <Box sx={{ mb: 3 }}>
          <Suspense fallback={renderLazyFallback(200)}>
            <CandidatesMap onCityClick={handleCityClick} />
          </Suspense>
        </Box>
      </Collapse >

      {/* Search and Filters */}
      < CandidateFiltersBar
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
          <CandidatesTable
            candidates={candidates}
            isLoading={isLoading}
            pagination={data?.pagination}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            selectedCandidates={selectedCandidates}
            onSelectCandidate={handleSelectCandidate}
            onSelectAll={handleSelectAll}
            onView={(candidateId) => navigate(`/candidates/${candidateId}`)}
            onEdit={handleEditCandidate}
            onArchive={(id, label) => archiveMutation.mutate({ id, label })}
            onUnarchive={(id, label) => unarchiveMutation.mutate({ id, label })}
            onDelete={(id, label) => deleteMutation.mutate({ id, label })}
            onRevertToProspect={(id, label) => revertToProspectMutation.mutate({ id, label })}
            onExtractSkills={handleExtractSkills}
            page={page}
            onPageChange={setPage}
            userRole={user?.role}
            onAddCandidate={() => setOpenAddDialog(true)}
          />
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
            <Box display="flex" alignItems="center" gap={1}>
              <HelpDialog
                title="Guide formulaire candidat"
                subtitle="Champs requis et astuces"
                sections={CANDIDATE_FORM_HELP_SECTIONS}
                faq={CANDIDATE_FORM_HELP_FAQ}
                triggerLabel="Aide formulaire"
              />
              <IconButton edge="end" onClick={handleCloseDialog}>
                <CancelIcon />
              </IconButton>
            </Box>
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
      <CreateCatalogueDialog
        open={openCatalogueDialog}
        onClose={() => setOpenCatalogueDialog(false)}
        selectedCandidatesCount={selectedCandidates.size}
        clients={clientsData?.data || []}
        onSubmit={handleCreateCatalogue}
        isSubmitting={createCatalogueMutation.isPending}
      />
    </Box >
  );
}
