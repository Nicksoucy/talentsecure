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
  TextField,
  CircularProgress,
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
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';
import { prospectService } from '@/services/prospect.service';
import { ProspectCandidate } from '@/types';
import ProspectsMapClustered from '@/components/map/ProspectsMapClustered';

export default function ProspectsPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [filters, setFilters] = useState({
    city: '',
    isContacted: '',
    isConverted: '',
  });

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

  // Fetch prospects
  const { data, isLoading, error } = useQuery({
    queryKey: ['prospects', page, pageSize, search, filters],
    queryFn: () =>
      prospectService.getProspects({
        page,
        limit: pageSize,
        search: search || undefined,
        city: filters.city || undefined,
        isContacted: filters.isContacted === '' ? undefined : filters.isContacted === 'true',
        isConverted: filters.isConverted === '' ? undefined : filters.isConverted === 'true',
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

  const handleContact = (prospect: ProspectCandidate) => {
    setContactDialog({ open: true, prospect });
  };

  const handleConfirmContact = () => {
    if (contactDialog.prospect) {
      markContactedMutation.mutate({
        id: contactDialog.prospect.id,
        notes: contactNotes,
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
          <ProspectsMapClustered />
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
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Nom</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Téléphone</TableCell>
                  <TableCell>Ville</TableCell>
                  <TableCell>CV</TableCell>
                  <TableCell>Date soumission</TableCell>
                  <TableCell>Contacté</TableCell>
                  <TableCell>Converti</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {prospects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center">
                      Aucun prospect trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  prospects.map((prospect: ProspectCandidate) => (
                    <TableRow key={prospect.id} hover>
                      <TableCell>
                        {prospect.firstName} {prospect.lastName}
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
                      <TableCell>{formatDate(prospect.submissionDate)}</TableCell>
                      <TableCell>
                        {prospect.isContacted ? (
                          <Chip label="Contacté" color="success" size="small" />
                        ) : (
                          <Chip label="À contacter" color="warning" size="small" />
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

      {/* Contact Dialog */}
      <Dialog
        open={contactDialog.open}
        onClose={() => setContactDialog({ open: false, prospect: null })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Marquer comme contacté</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {contactDialog.prospect &&
              `${contactDialog.prospect.firstName} ${contactDialog.prospect.lastName}`}
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Notes (optionnel)"
            value={contactNotes}
            onChange={(e) => setContactNotes(e.target.value)}
            placeholder="Ajouter des notes sur le contact..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContactDialog({ open: false, prospect: null })}>
            Annuler
          </Button>
          <Button
            onClick={handleConfirmContact}
            variant="contained"
            disabled={markContactedMutation.isPending}
          >
            {markContactedMutation.isPending ? 'En cours...' : 'Confirmer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* CV Preview Dialog */}
      <Dialog
        open={cvPreviewDialog.open}
        onClose={() => setCvPreviewDialog({ open: false, cvUrl: null, prospectName: '' })}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <DescriptionIcon />
              <Typography variant="h6">
                CV - {cvPreviewDialog.prospectName}
              </Typography>
            </Box>
            <IconButton
              onClick={() => setCvPreviewDialog({ open: false, cvUrl: null, prospectName: '' })}
              size="small"
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0, height: '80vh' }}>
          {cvPreviewDialog.cvUrl && (
            <iframe
              src={cvPreviewDialog.cvUrl}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
              }}
              title={`CV - ${cvPreviewDialog.prospectName}`}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => window.open(cvPreviewDialog.cvUrl!, '_blank')}
            startIcon={<DownloadIcon />}
            variant="outlined"
          >
            Télécharger
          </Button>
          <Button
            onClick={() => setCvPreviewDialog({ open: false, cvUrl: null, prospectName: '' })}
            variant="contained"
          >
            Fermer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
