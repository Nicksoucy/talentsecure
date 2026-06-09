import { Suspense, useState, useEffect, lazy } from 'react';
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
  TextField,
  Alert,
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Collapse,
  Checkbox,
  Toolbar,
  CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  Visibility as ViewIcon,
  ContactMail as ContactIcon,
  Transform as TransformIcon,
  Delete as DeleteIcon,
  FilterList as FilterIcon,
  Map as MapIcon,
  Description as DescriptionIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Download as DownloadIcon,
  Close as CloseIcon,
  FileDownload as FileDownloadIcon,
  VideoLibrary as VideoIcon,
  Sync as SyncIcon,
  Star as StarIcon,
  Add as AddIcon,
  Badge as BadgeIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { TableSkeleton } from '@/components/skeletons';
import CVPreview from '@/components/CVPreview';
import ProspectVideoPlayer from '@/components/video/ProspectVideoPlayer';
import ContactConflictDialog from '@/components/ContactConflictDialog';
import { ContactConflict } from '@/services/contact.service';
import { useNavigate } from 'react-router-dom';
import { prospectService } from '@/services/prospect.service';
import { downloadProspectsCsv } from './prospectsCsv';
import ProspectsDialogs from './ProspectsDialogs';
import { employeeService } from '@/services/employee.service';
import { clientService } from '@/services/client.service';
import { ProspectCandidate } from '@/types';
const ProspectsMapClustered = lazy(() => import('@/components/map/ProspectsMapClustered'));
import { prospectContactSchema } from '@/validation/prospect';

export default function ProspectsPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const renderLazyFallback = (minHeight = 240) => (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight={minHeight}>
      <CircularProgress />
    </Box>
  );

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [filters, setFilters] = useState({
    city: '',
    cities: [] as string[], // sélection par rayon sur la carte (multi-villes)
    isContacted: '',
    isConverted: '',
    hasVideo: '',
    submissionDateStart: '',
    submissionDateEnd: '',
  });

  // Selection state
  const [selectedProspects, setSelectedProspects] = useState<Set<string>>(new Set());
  const [selectAllPages, setSelectAllPages] = useState(false);

  // Contact dialog
  const [contactDialog, setContactDialog] = useState<{ open: boolean; prospect: ProspectCandidate | null }>({
    open: false,
    prospect: null,
  });
  const [contactNotes, setContactNotes] = useState('');

  // CV Preview dialog
  const [cvPreviewDialog, setCvPreviewDialog] = useState<{ open: boolean; cvUrl: string | null; prospectName: string }>({
    open: false,
    cvUrl: null,
    prospectName: '',
  });

  // Video Preview dialog
  const [videoPreviewDialog, setVideoPreviewDialog] = useState<{ open: boolean; prospectId: string | null; prospectName: string }>({
    open: false,
    prospectId: null,
    prospectName: '',
  });

  // Ajout manuel d'un prospect
  const [addProspectOpen, setAddProspectOpen] = useState(false);
  const [prospectForm, setProspectForm] = useState({ firstName: '', lastName: '', email: '', phone: '', city: '', streetAddress: '' });
  const [contactConflict, setContactConflict] = useState<ContactConflict | null>(null);

  const createProspectMutation = useMutation({
    mutationFn: () => prospectService.createProspect(prospectForm),
    onSuccess: () => {
      enqueueSnackbar('Prospect créé', { variant: 'success' });
      setAddProspectOpen(false);
      setProspectForm({ firstName: '', lastName: '', email: '', phone: '', city: '', streetAddress: '' });
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
    },
    onError: (error: any) => {
      if (error.response?.status === 409 && error.response?.data?.conflict) {
        setAddProspectOpen(false);
        setContactConflict(error.response.data.conflict);
        return;
      }
      enqueueSnackbar(error.response?.data?.error || 'Erreur lors de la création', { variant: 'error' });
    },
  });

  // Transfert (assignation) de prospects vers un client
  const [assignClientDialogOpen, setAssignClientDialogOpen] = useState(false);
  const [assignClientId, setAssignClientId] = useState<string>('');

  const { data: clientsData } = useQuery({
    queryKey: ['clients', 'all'],
    queryFn: () => clientService.getClients({ limit: 200 }),
    enabled: assignClientDialogOpen, // ne charge que quand on ouvre le dialog
  });

  const assignToClientMutation = useMutation({
    mutationFn: () => {
      const ids = Array.from(selectedProspects);
      return prospectService.bulkAssignToClient(ids, assignClientId);
    },
    onSuccess: (res) => {
      enqueueSnackbar(
        `${res.assigned} transféré(s) vers ${res.clientName}${res.alreadyAssigned ? ` — ${res.alreadyAssigned} déjà assigné(s)` : ''}${res.errors ? ` — ${res.errors} erreur(s)` : ''}.`,
        { variant: res.errors ? 'warning' : 'success', autoHideDuration: 8000 }
      );
      setAssignClientDialogOpen(false);
      setAssignClientId('');
      setSelectedProspects(new Set());
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
    },
    onError: (e: any) => {
      enqueueSnackbar(e.response?.data?.error || 'Erreur lors du transfert', { variant: 'error' });
    },
  });

  // Synchronisation du survey vidéo
  const syncSurveyMutation = useMutation({
    mutationFn: () => prospectService.syncSurvey(),
    onSuccess: (res) => {
      const d = res.data;
      enqueueSnackbar(
        `Survey synchronisé : ${d.created} créés, ${d.updated} mis à jour, ${d.linkedExisting} déjà empl/cand, ${d.errors} erreurs`,
        { variant: d.errors ? 'warning' : 'success', autoHideDuration: 8000 }
      );
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
    },
    onError: (e: any) => {
      enqueueSnackbar(e.response?.data?.error || 'Erreur lors de la synchronisation', { variant: 'error' });
    },
  });

  // Reset selection when changing pages (unless "select all pages" is active)
  useEffect(() => {
    if (!selectAllPages) {
      setSelectedProspects(new Set());
    }
  }, [page, selectAllPages]);

  // Fetch prospects
  const { data, isLoading, error } = useQuery({
    queryKey: ['prospects', page, pageSize, search, filters],
    queryFn: () =>
      prospectService.getProspects({
        page,
        limit: pageSize,
        search: search || undefined,
        city: filters.city || undefined,
        cities: filters.cities.length > 0 ? filters.cities : undefined,
        isContacted: filters.isContacted === '' ? undefined : filters.isContacted === 'true',
        isConverted: filters.isConverted === '' ? undefined : filters.isConverted === 'true',
        hasVideo: filters.hasVideo === '' ? undefined : filters.hasVideo === 'true',
        submissionDateStart: filters.submissionDateStart || undefined,
        submissionDateEnd: filters.submissionDateEnd || undefined,
        sortBy: 'submissionDate',
        sortOrder: 'desc',
      }),
  });

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['prospects', 'stats'],
    queryFn: () => prospectService.getProspectsStats(),
  });

  // Mark as contacted mutation
  const markContactedMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      prospectService.markAsContacted(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
      enqueueSnackbar('Prospect marqué comme contacté', { variant: 'success' });
      setContactDialog({ open: false, prospect: null });
      setContactNotes('');
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.error || 'Erreur lors de la mise à jour', { variant: 'error' });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => prospectService.deleteProspect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
      enqueueSnackbar('Prospect supprimé', { variant: 'success' });
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.error || 'Erreur lors de la suppression', { variant: 'error' });
    },
  });

  // Promotion directe Prospect -> Employé
  const promoteToEmployeeMutation = useMutation({
    mutationFn: (id: string) => employeeService.promoteProspect(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      const newId = response?.data?.id;
      enqueueSnackbar('Candidat potentiel converti en employé', { variant: 'success' });
      if (newId) navigate(`/employees/${newId}`);
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.error || 'Impossible de convertir en employé', { variant: 'error' });
    },
  });

  const handleContact = (prospect: ProspectCandidate) => {
    setContactDialog({ open: true, prospect });
  };

  const handleConfirmContact = () => {
    if (contactDialog.prospect) {
      const validation = prospectContactSchema.safeParse({ notes: contactNotes });

      if (!validation.success) {
        const firstIssue = validation.error.issues[0];
        enqueueSnackbar(firstIssue?.message || 'Notes invalides.', { variant: 'error' });
        return;
      }

      markContactedMutation.mutate({
        id: contactDialog.prospect.id,
        notes: validation.data.notes?.trim() || undefined,
      });
    }
  };

  const handleConvert = (prospect: ProspectCandidate) => {
    // Navigate to conversion page with prospect data
    navigate(`/prospects/${prospect.id}/convert`);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce prospect ?')) {
      deleteMutation.mutate(id);
    }
  };

  const handlePromoteToEmployee = (prospect: ProspectCandidate) => {
    const name = `${prospect.firstName} ${prospect.lastName}`;
    if (window.confirm(
      `Convertir ${name} directement en employé ?\n\n` +
      `La fiche sera créée dans Employés (avec son profil et la gestion d'uniforme), ` +
      `et ${name} sera retiré(e) des Candidats Potentiels. L'étape Candidat est sautée.`
    )) {
      promoteToEmployeeMutation.mutate(prospect.id);
    }
  };

  // Selection handlers
  const handleCityClick = (city: string) => {
    setFilters({ ...filters, city, cities: [] });
    setShowMap(false); // Hide map after filtering
    enqueueSnackbar(`Filtré par ville: ${city}`, { variant: 'info' });
  };

  // Sélection par rayon sur la carte : filtre la liste sur ces villes ET coche
  // tous leurs prospects (pour réutiliser les actions groupées existantes).
  const handleRadiusSelect = async (cities: string[], center: string, radiusKm: number) => {
    if (cities.length === 0) {
      enqueueSnackbar('Aucune ville dans ce rayon', { variant: 'warning' });
      return;
    }
    setFilters({ ...filters, city: '', cities });
    setShowMap(false);
    try {
      const response = await prospectService.getProspects({ page: 1, limit: 10000, cities });
      const ids = response.data.map((p: ProspectCandidate) => p.id);
      setSelectedProspects(new Set(ids));
      setSelectAllPages(false);
      enqueueSnackbar(
        `${ids.length} prospect${ids.length > 1 ? 's' : ''} sélectionné${ids.length > 1 ? 's' : ''} (${cities.length} ville${cities.length > 1 ? 's' : ''}, ${radiusKm} km autour de ${center})`,
        { variant: 'success', autoHideDuration: 8000 },
      );
    } catch {
      enqueueSnackbar('Erreur lors de la sélection par rayon', { variant: 'error' });
    }
  };

  const handleSelectProspect = (id: string) => {
    const newSelected = new Set(selectedProspects);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedProspects(newSelected);
    setSelectAllPages(false); // Reset when manually selecting
  };

  const handleSelectAll = () => {
    if (selectedProspects.size === prospects.length) {
      setSelectedProspects(new Set());
      setSelectAllPages(false);
    } else {
      setSelectedProspects(new Set(prospects.map((p: ProspectCandidate) => p.id)));
      setSelectAllPages(false);
    }
  };

  const handleSelectAllPages = async () => {
    try {
      // Fetch all prospect IDs matching current filters
      const response = await prospectService.getProspects({
        page: 1,
        limit: 10000, // Large limit to get all
        search: search || undefined,
        city: filters.city || undefined,
        cities: filters.cities.length > 0 ? filters.cities : undefined,
        isContacted: filters.isContacted === '' ? undefined : filters.isContacted === 'true',
        isConverted: filters.isConverted === '' ? undefined : filters.isConverted === 'true',
      });

      const allIds = response.data.map((p: ProspectCandidate) => p.id);
      setSelectedProspects(new Set(allIds));
      setSelectAllPages(true);

      enqueueSnackbar(`${allIds.length} prospects sélectionnés (toutes pages)`, {
        variant: 'info',
      });
    } catch (error) {
      enqueueSnackbar('Erreur lors de la sélection', { variant: 'error' });
    }
  };

  const handleBulkContact = async () => {
    if (selectedProspects.size === 0 && !selectAllPages) return;

    try {
      let prospectsToContact: string[] = [];

      if (selectAllPages) {
        // Get all IDs that match the current filters
        const response = await prospectService.getProspects({
          page: 1,
          limit: 10000,
          search: search || undefined,
          city: filters.city || undefined,
          cities: filters.cities.length > 0 ? filters.cities : undefined,
          isContacted: filters.isContacted === '' ? undefined : filters.isContacted === 'true',
          isConverted: filters.isConverted === '' ? undefined : filters.isConverted === 'true',
        });
        prospectsToContact = response.data.map((p: ProspectCandidate) => p.id);
      } else {
        prospectsToContact = Array.from(selectedProspects);
      }

      // Mark all as contacted
      await Promise.all(
        prospectsToContact.map((id) => prospectService.markAsContacted(id))
      );

      enqueueSnackbar(`${prospectsToContact.length} prospects marqués comme contactés`, {
        variant: 'success',
      });

      setSelectedProspects(new Set());
      setSelectAllPages(false);
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
      queryClient.invalidateQueries({ queryKey: ['prospects', 'stats'] });
    } catch (error) {
      enqueueSnackbar('Erreur lors du marquage des prospects', { variant: 'error' });
    }
  };

  const [isExportingZip, setIsExportingZip] = useState(false);

  const handleExportZip = async () => {
    if (selectedProspects.size === 0) {
      enqueueSnackbar('Sélectionne d\'abord les prospects à exporter', { variant: 'warning' });
      return;
    }
    if (selectedProspects.size > 200) {
      enqueueSnackbar('Maximum 200 prospects par ZIP. Sélectionne moins de prospects.', { variant: 'warning' });
      return;
    }
    setIsExportingZip(true);
    enqueueSnackbar(`Préparation du ZIP (${selectedProspects.size} prospects)… ça peut prendre une minute.`, { variant: 'info', autoHideDuration: 6000 });
    try {
      const ids = Array.from(selectedProspects);
      const blob = await prospectService.exportZipWithCvs(ids);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `prospects_avec_cvs_${new Date().toISOString().slice(0, 10)}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      enqueueSnackbar(`${selectedProspects.size} prospects exportés (ZIP avec CV)`, { variant: 'success' });
    } catch (e: any) {
      // responseType:'blob' → l'erreur backend (JSON) est dans un Blob, faut le lire
      let msg = e.message || 'Erreur lors de l\'export ZIP';
      if (e.response?.data instanceof Blob) {
        try {
          const text = await e.response.data.text();
          const parsed = JSON.parse(text);
          msg = parsed.error || parsed.message || msg;
        } catch {
          // garde msg par défaut
        }
      } else if (e.response?.data?.error) {
        msg = e.response.data.error;
      }
      enqueueSnackbar(msg, { variant: 'error', autoHideDuration: 15000 });
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleExportCSV = async () => {
    if (selectedProspects.size === 0 && !selectAllPages) return;

    try {
      let prospectsToExport: ProspectCandidate[] = [];

      if (selectAllPages) {
        // Get all prospects that match the current filters
        const response = await prospectService.getProspects({
          page: 1,
          limit: 10000,
          search: search || undefined,
          city: filters.city || undefined,
          cities: filters.cities.length > 0 ? filters.cities : undefined,
          isContacted: filters.isContacted === '' ? undefined : filters.isContacted === 'true',
          isConverted: filters.isConverted === '' ? undefined : filters.isConverted === 'true',
        });
        prospectsToExport = response.data;
      } else {
        // Filter current prospects by selected IDs
        prospectsToExport = prospects.filter((p: ProspectCandidate) =>
          selectedProspects.has(p.id)
        );
      }

      const count = downloadProspectsCsv(prospectsToExport);
      enqueueSnackbar(`${count} prospects exportés en CSV`, { variant: 'success' });
    } catch (error) {
      enqueueSnackbar('Erreur lors de l\'export CSV', { variant: 'error' });
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('fr-CA');
  };

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Erreur lors du chargement des prospects: {(error as any).message}
        </Alert>
      </Box>
    );
  }

  const prospects = data?.data || [];
  const totalPages = data?.pagination?.totalPages || 1;
  const stats = statsData?.data;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Candidats Potentiels
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<FilterIcon />}
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Masquer filtres' : 'Afficher filtres'}
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
            color="info"
            startIcon={<SyncIcon />}
            onClick={() => syncSurveyMutation.mutate()}
            disabled={syncSurveyMutation.isPending}
          >
            {syncSurveyMutation.isPending ? 'Synchronisation…' : 'Synchroniser le survey'}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setAddProspectOpen(true)}
          >
            Ajouter un prospect
          </Button>
        </Box>
      </Box>

      {/* Statistics Cards */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total
                </Typography>
                <Typography variant="h4">{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  À contacter
                </Typography>
                <Typography variant="h4">{stats.pending}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Contactés
                </Typography>
                <Typography variant="h4">{stats.contacted}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Convertis
                </Typography>
                <Typography variant="h4">
                  {stats.converted} ({stats.conversionRate}%)
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Map */}
      <Collapse in={showMap}>
        <Box sx={{ mb: 3 }}>
          <Suspense fallback={renderLazyFallback(200)}>
            <ProspectsMapClustered onCityClick={handleCityClick} onRadiusSelect={handleRadiusSelect} />
          </Suspense>
        </Box>
      </Collapse>

      {/* Search */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <TextField
            fullWidth
            placeholder="Rechercher par nom, email, téléphone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />

          {/* Filters */}
          {showFilters && (
            <Grid container spacing={2} sx={{ mt: 2 }}>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Ville"
                  value={filters.city}
                  onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Statut de contact</InputLabel>
                  <Select
                    value={filters.isContacted}
                    onChange={(e) => setFilters({ ...filters, isContacted: e.target.value })}
                  >
                    <MenuItem value="">Tous</MenuItem>
                    <MenuItem value="false">À contacter</MenuItem>
                    <MenuItem value="true">Contacté</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Conversion</InputLabel>
                  <Select
                    value={filters.isConverted}
                    onChange={(e) => setFilters({ ...filters, isConverted: e.target.value })}
                  >
                    <MenuItem value="">Tous</MenuItem>
                    <MenuItem value="false">Non converti</MenuItem>
                    <MenuItem value="true">Converti</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Vidéo</InputLabel>
                  <Select
                    label="Vidéo"
                    value={filters.hasVideo}
                    onChange={(e) => { setFilters({ ...filters, hasVideo: e.target.value }); setPage(1); }}
                  >
                    <MenuItem value="">Tous</MenuItem>
                    <MenuItem value="true">Avec vidéo</MenuItem>
                    <MenuItem value="false">Sans vidéo</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  type="date"
                  label="Soumis à partir du"
                  InputLabelProps={{ shrink: true }}
                  value={filters.submissionDateStart}
                  onChange={(e) => { setFilters({ ...filters, submissionDateStart: e.target.value }); setPage(1); }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  type="date"
                  label="Soumis jusqu'au"
                  InputLabelProps={{ shrink: true }}
                  value={filters.submissionDateEnd}
                  onChange={(e) => { setFilters({ ...filters, submissionDateEnd: e.target.value }); setPage(1); }}
                />
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={10} columns={6} hasActions={false} hasFilters={false} hasHeader={false} />
      ) : (
        <>
          {/* Bulk Actions Toolbar */}
          {selectedProspects.size > 0 && (
            <Paper sx={{ mb: 2, p: 2, bgcolor: 'primary.light', color: 'primary.contrastText' }}>
              <Toolbar sx={{ gap: 2, flexDirection: 'column', alignItems: 'flex-start' }}>
                <Box sx={{ display: 'flex', gap: 2, width: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography variant="subtitle1">
                    {selectAllPages
                      ? `Tous les ${selectedProspects.size} prospects sélectionnés`
                      : `${selectedProspects.size} prospect${selectedProspects.size > 1 ? 's' : ''} sélectionné${selectedProspects.size > 1 ? 's' : ''}`}
                    {filters.cities.length > 0 && ` · zone : ${filters.cities.length} ville${filters.cities.length > 1 ? 's' : ''}`}
                  </Typography>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<ContactIcon />}
                    onClick={handleBulkContact}
                  >
                    Marquer comme contactés
                  </Button>
                  <Button
                    variant="contained"
                    color="info"
                    startIcon={<FileDownloadIcon />}
                    onClick={handleExportCSV}
                  >
                    Exporter CSV
                  </Button>
                  <Button
                    variant="contained"
                    color="info"
                    startIcon={<FileDownloadIcon />}
                    onClick={handleExportZip}
                    disabled={isExportingZip}
                  >
                    {isExportingZip ? 'Préparation…' : 'Exporter avec CVs (ZIP)'}
                  </Button>
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<BadgeIcon />}
                    onClick={() => setAssignClientDialogOpen(true)}
                  >
                    Transférer vers un client
                  </Button>
                  <Button
                    variant="outlined"
                    sx={{ color: 'white', borderColor: 'white' }}
                    onClick={() => {
                      setSelectedProspects(new Set());
                      setSelectAllPages(false);
                      if (filters.cities.length > 0) setFilters({ ...filters, cities: [] });
                    }}
                  >
                    Annuler la sélection
                  </Button>
                </Box>
                {/* Show "Select all pages" option when all current page items are selected */}
                {!selectAllPages &&
                  selectedProspects.size === prospects.length &&
                  data?.pagination?.total &&
                  data.pagination.total > prospects.length && (
                    <Alert
                      severity="info"
                      sx={{ mt: 1, bgcolor: 'white', color: 'text.primary' }}
                      action={
                        <Button color="primary" size="small" onClick={handleSelectAllPages}>
                          Sélectionner tout
                        </Button>
                      }
                    >
                      {prospects.length} prospects sélectionnés sur cette page.{' '}
                      <strong>
                        Sélectionner tous les {data.pagination.total} prospects{' '}
                        {filters.city && `de ${filters.city}`}?
                      </strong>
                    </Alert>
                  )}
              </Toolbar>
            </Paper>
          )}

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={
                        selectedProspects.size > 0 && selectedProspects.size < prospects.length
                      }
                      checked={prospects.length > 0 && selectedProspects.size === prospects.length}
                      onChange={handleSelectAll}
                    />
                  </TableCell>
                  <TableCell>Nom</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Téléphone</TableCell>
                  <TableCell>Ville</TableCell>
                  <TableCell>CV</TableCell>
                  <TableCell>Vidéo</TableCell>
                  <TableCell>Date soumission</TableCell>
                  <TableCell>Contacté</TableCell>
                  <TableCell>Converti</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {prospects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} align="center">
                      Aucun prospect trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  prospects.map((prospect: ProspectCandidate) => (
                    <TableRow
                      key={prospect.id}
                      hover
                      selected={selectedProspects.has(prospect.id)}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedProspects.has(prospect.id)}
                          onChange={() => handleSelectProspect(prospect.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {prospect.videoStoragePath && (
                            <StarIcon
                              fontSize="small"
                              sx={{ color: 'warning.main' }}
                              titleAccess="Prioritaire — a envoyé une vidéo"
                            />
                          )}
                          {prospect.firstName} {prospect.lastName}
                        </Box>
                      </TableCell>
                      <TableCell>{prospect.email || 'N/A'}</TableCell>
                      <TableCell>{prospect.phone}</TableCell>
                      <TableCell>{prospect.city || 'N/A'}</TableCell>
                      <TableCell>
                        {prospect.cvUrl ? (
                          <Chip
                            icon={<CheckCircleIcon />}
                            label="Voir"
                            color="success"
                            size="small"
                            onClick={() => setCvPreviewDialog({
                              open: true,
                              cvUrl: prospect.cvUrl,
                              prospectName: `${prospect.firstName} ${prospect.lastName}`,
                            })}
                            sx={{ cursor: 'pointer' }}
                          />
                        ) : (
                          <Chip icon={<CancelIcon />} label="Non" color="default" size="small" />
                        )}
                      </TableCell>
                      <TableCell>
                        {prospect.videoStoragePath ? (
                          <Chip
                            icon={<VideoIcon />}
                            label="Voir"
                            color="info"
                            size="small"
                            onClick={() => setVideoPreviewDialog({
                              open: true,
                              prospectId: prospect.id,
                              prospectName: `${prospect.firstName} ${prospect.lastName}`,
                            })}
                            sx={{ cursor: 'pointer' }}
                          />
                        ) : (
                          <Chip icon={<CancelIcon />} label="Non" color="default" size="small" />
                        )}
                      </TableCell>
                      <TableCell>{formatDate(prospect.submissionDate)}</TableCell>
                      <TableCell>
                        {prospect.isContacted ? (
                          <Chip label="Contacté" color="success" size="small" />
                        ) : (
                          <Chip
                            label="À contacter"
                            color="warning"
                            size="small"
                            onClick={() => handleContact(prospect)}
                            sx={{ cursor: 'pointer', '&:hover': { opacity: 0.85 } }}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {prospect.isConverted ? (
                          <Chip label="Converti" color="info" size="small" />
                        ) : (
                          <Chip label="Non converti" color="default" size="small" />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={() => navigate(`/prospects/${prospect.id}`)}
                          title="Voir détails"
                        >
                          <ViewIcon />
                        </IconButton>
                        {!prospect.isContacted && (
                          <IconButton
                            size="small"
                            onClick={() => handleContact(prospect)}
                            title="Marquer comme contacté"
                            color="primary"
                          >
                            <ContactIcon />
                          </IconButton>
                        )}
                        {!prospect.isConverted && (
                          <IconButton
                            size="small"
                            onClick={() => handleConvert(prospect)}
                            title="Convertir en candidat"
                            color="success"
                          >
                            <TransformIcon />
                          </IconButton>
                        )}
                        {!prospect.isConverted && (
                          <IconButton
                            size="small"
                            onClick={() => handlePromoteToEmployee(prospect)}
                            title="Convertir directement en employé (saute l'étape candidat)"
                            color="primary"
                          >
                            <BadgeIcon />
                          </IconButton>
                        )}
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(prospect.id)}
                          title="Supprimer"
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, value) => setPage(value)}
                color="primary"
              />
            </Box>
          )}
        </>
      )}

      <ProspectsDialogs
        contactDialog={contactDialog}
        setContactDialog={setContactDialog}
        contactNotes={contactNotes}
        setContactNotes={setContactNotes}
        onConfirmContact={handleConfirmContact}
        contactPending={markContactedMutation.isPending}
        cvPreviewDialog={cvPreviewDialog}
        setCvPreviewDialog={setCvPreviewDialog}
        videoPreviewDialog={videoPreviewDialog}
        setVideoPreviewDialog={setVideoPreviewDialog}
        addProspectOpen={addProspectOpen}
        setAddProspectOpen={setAddProspectOpen}
        prospectForm={prospectForm}
        setProspectForm={setProspectForm}
        onCreateProspect={() => createProspectMutation.mutate()}
        createPending={createProspectMutation.isPending}
        contactConflict={contactConflict}
        setContactConflict={setContactConflict}
        assignClientDialogOpen={assignClientDialogOpen}
        setAssignClientDialogOpen={setAssignClientDialogOpen}
        assignClientId={assignClientId}
        setAssignClientId={setAssignClientId}
        clients={clientsData?.data || []}
        onAssignToClient={() => assignToClientMutation.mutate()}
        assignPending={assignToClientMutation.isPending}
        selectedCount={selectedProspects.size}
      />
    </Box>
  );
}
