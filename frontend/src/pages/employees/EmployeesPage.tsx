import { useState, useEffect, lazy, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Collapse,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  TextField,
  Pagination,
  InputAdornment,
  CircularProgress,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Link,
} from '@mui/material';
import {
  Search as SearchIcon,
  Badge as BadgeIcon,
  Add as AddIcon,
  Checkroom as CheckroomIcon,
  Map as MapIcon,
} from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { employeeService } from '@/services/employee.service';
import { useAuthStore } from '@/store/authStore';
import ContactConflictDialog from '@/components/ContactConflictDialog';
import { contactService, ContactConflict } from '@/services/contact.service';
import CrossTableHint from '@/components/CrossTableHint';

const EmployeesMap = lazy(() => import('@/components/map/EmployeesMap'));

/** Rayon actif : point (carte) + rayon, avec un libellé optionnel pour la chip. */
interface NearFilter {
  lat: number;
  lng: number;
  radiusKm: number;
  label?: string;
}

function formatDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-CA');
}

const EMPTY_FORM = { firstName: '', lastName: '', email: '', phone: '', status: 'ACTIF', hireDate: '', position: '', assignment: '' };

export default function EmployeesPage() {
  // Lien profond `?q=` (depuis le bandeau « trouvé ailleurs » / l'omnibox) : pré-remplit la recherche.
  const [searchParams] = useSearchParams();
  const initialQ = searchParams.get('q') || '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(initialQ);
  // La saisie est instantanée (controlled), mais l'appel API est debouncé (300 ms)
  // pour ne pas refaire une requête à chaque frappe.
  const [debouncedSearch, setDebouncedSearch] = useState(initialQ);
  const [status, setStatus] = useState<'' | 'ACTIF' | 'INACTIF'>('');
  // Carte des agents actifs (repliée par défaut) + filtre par rayon depuis la carte.
  const [showMap, setShowMap] = useState(false);
  const [nearFilter, setNearFilter] = useState<NearFilter | null>(null);
  const pageSize = 20;
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isUniformStaff = user?.role === 'ADMIN' || user?.role === 'RH_RECRUITER';

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [contactConflict, setContactConflict] = useState<ContactConflict | null>(null);
  // Vérification proactive de doublon (par courriel) AVANT de créer.
  // 'idle' = pas encore vérifié ; 'none' = vérifié, aucun doublon trouvé.
  const [dupChecked, setDupChecked] = useState<'idle' | 'none'>('idle');

  // Réutilise l'infra existante : GET /api/contacts/lookup cherche dans les 3
  // sections (Employé/Candidat/Prospect), inclut les inactifs, exclut les
  // fiches supprimées. Si trouvé → on rouvre le ContactConflictDialog existant
  // (« Voir la fiche existante » + « Déplacer vers Employés »).
  const checkDuplicate = useMutation({
    mutationFn: () => contactService.lookup(form.email.trim() || undefined),
    onSuccess: (res) => {
      if (res.data) {
        setAddOpen(false);
        setContactConflict(res.data);
        setDupChecked('idle');
      } else {
        setDupChecked('none');
      }
    },
    onError: (error: any) =>
      enqueueSnackbar(error.response?.data?.error || 'Erreur lors de la vérification', { variant: 'error' }),
  });

  const createMutation = useMutation({
    mutationFn: () => employeeService.createEmployee({
      ...form,
      hireDate: form.hireDate || undefined,
    } as any),
    onSuccess: () => {
      enqueueSnackbar('Employé créé', { variant: 'success' });
      setAddOpen(false);
      setForm({ ...EMPTY_FORM });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (error: any) => {
      if (error.response?.status === 409 && error.response?.data?.conflict) {
        setAddOpen(false);
        setContactConflict(error.response.data.conflict);
        return;
      }
      enqueueSnackbar(error.response?.data?.error || 'Erreur lors de la création', { variant: 'error' });
    },
  });

  // Debounce de la recherche (300 ms) — repart en page 1 à chaque nouveau terme.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['employees', page, debouncedSearch, status, nearFilter],
    queryFn: () =>
      employeeService.getEmployees({
        page,
        limit: pageSize,
        search: debouncedSearch.trim() || undefined,
        status: status || undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        near: nearFilter
          ? { lat: nearFilter.lat, lng: nearFilter.lng, radiusKm: nearFilter.radiusKm }
          : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  // Recherche par rayon autour d'un POINT de la carte (déposé, recherché, ou
  // « Voir ces agents » d'un pin) : filtre la liste sur ce rayon, triée du plus
  // proche au plus loin (colonne Distance).
  const handleNearbySelect = (
    center: { lat: number; lng: number },
    radiusKm: number,
    label?: string
  ) => {
    setNearFilter({ lat: center.lat, lng: center.lng, radiusKm, label });
    setShowMap(false);
    setPage(1);
    enqueueSnackbar(
      label
        ? `Agents à ce point — ${label}`
        : `Agents dans un rayon de ${radiusKm} km — liste triée par distance`,
      { variant: 'success', autoHideDuration: 6000 }
    );
  };

  const { data: statsData } = useQuery({
    queryKey: ['employees', 'stats'],
    queryFn: () => employeeService.getEmployeesStats(),
  });

  const employees = data?.data ?? [];
  const totalPages = data?.pagination.totalPages ?? 1;
  const totalResults = data?.pagination.total ?? 0;
  const stats = statsData?.data;
  const searchActive = debouncedSearch.trim().length > 0;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BadgeIcon color="primary" />
          <Typography variant="h4" fontWeight="bold">
            Employés
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<MapIcon />}
            onClick={() => setShowMap(!showMap)}
          >
            {showMap ? 'Masquer la carte' : 'Afficher la carte'}
          </Button>
          {isUniformStaff && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => { setForm({ ...EMPTY_FORM }); setDupChecked('idle'); setAddOpen(true); }}
            >
              Ajouter un employé
            </Button>
          )}
        </Box>
      </Box>

      {/* Carte des agents actifs (adresse exacte) — chargée seulement à l'ouverture. */}
      <Collapse in={showMap} mountOnEnter>
        <Box sx={{ mb: 3 }}>
          <Suspense
            fallback={
              <Box display="flex" justifyContent="center" alignItems="center" height={200}>
                <CircularProgress />
              </Box>
            }
          >
            <EmployeesMap onNearbySelect={handleNearbySelect} />
          </Suspense>
        </Box>
      </Collapse>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Total</Typography>
              <Typography variant="h4">{stats?.total ?? '—'}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Actifs</Typography>
              <Typography variant="h4" color="success.main">{stats?.actifs ?? '—'}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Inactifs</Typography>
              <Typography variant="h4" color="text.disabled">{stats?.inactifs ?? '—'}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filtres */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            placeholder="Rechercher par nom, email, téléphone, mandat…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1, minWidth: 260 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><SearchIcon /></InputAdornment>
              ),
            }}
          />
          <FormControl sx={{ minWidth: 160 }}>
            <InputLabel>Statut</InputLabel>
            <Select
              label="Statut"
              value={status}
              onChange={(e) => { setStatus(e.target.value as any); setPage(1); }}
            >
              <MenuItem value="">Tous</MenuItem>
              <MenuItem value="ACTIF">Actif</MenuItem>
              <MenuItem value="INACTIF">Inactif</MenuItem>
            </Select>
          </FormControl>
          {nearFilter && (
            <Chip
              color="primary"
              label={`≤ ${nearFilter.radiusKm} km${nearFilter.label ? ` — ${nearFilter.label}` : ''}`}
              onDelete={() => { setNearFilter(null); setPage(1); }}
              sx={{ alignSelf: 'center' }}
            />
          )}
        </CardContent>
      </Card>

      {/* Bandeau « trouvé ailleurs » : 0 employé ici, mais la personne existe peut-être en candidat/prospect. */}
      <CrossTableHint q={debouncedSearch} currentSection="employee" enabled={!isLoading && employees.length === 0} />

      {/* Tableau */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nom</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Téléphone</TableCell>
              <TableCell>Ville</TableCell>
              {nearFilter && <TableCell>Distance</TableCell>}
              <TableCell>Poste</TableCell>
              <TableCell>Mandat</TableCell>
              <TableCell>Embauche</TableCell>
              <TableCell>Statut</TableCell>
              {isUniformStaff && <TableCell align="right">Uniformes</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8 + (isUniformStaff ? 1 : 0) + (nearFilter ? 1 : 0)} align="center" sx={{ py: 6 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8 + (isUniformStaff ? 1 : 0) + (nearFilter ? 1 : 0)} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">Aucun employé</Typography>
                </TableCell>
              </TableRow>
            ) : (
              employees.map((e) => (
                <TableRow key={e.id} hover>
                  <TableCell>
                    {isUniformStaff ? (
                      <Link
                        component="button"
                        type="button"
                        underline="hover"
                        onClick={() => navigate(`/employees/${e.id}`)}
                        sx={{ textAlign: 'left', fontWeight: 500, cursor: 'pointer' }}
                      >
                        {e.firstName} {e.lastName}
                      </Link>
                    ) : (
                      `${e.firstName} ${e.lastName}`
                    )}
                  </TableCell>
                  <TableCell>{e.email || '—'}</TableCell>
                  <TableCell>{e.phone}</TableCell>
                  <TableCell>{e.city || '—'}</TableCell>
                  {nearFilter && (
                    <TableCell>{e.distanceKm != null ? `${e.distanceKm} km` : '—'}</TableCell>
                  )}
                  <TableCell>{e.position || '—'}</TableCell>
                  <TableCell>{e.assignment || '—'}</TableCell>
                  <TableCell>{formatDate(e.hireDate)}</TableCell>
                  <TableCell>
                    <Chip
                      label={e.status === 'ACTIF' ? 'Actif' : 'Inactif'}
                      color={e.status === 'ACTIF' ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  {isUniformStaff && (
                    <TableCell align="right">
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
                        {/* Indicateur : un brouillon de remise d'uniforme a été préparé d'avance
                            pour cet employé et attend d'être finalisé. Clic = ouvre la fiche. */}
                        {(e.draftIssuanceCount ?? 0) > 0 && (
                          <Tooltip title={`${e.draftIssuanceCount} brouillon${e.draftIssuanceCount! > 1 ? 's' : ''} de remise d'uniforme à finaliser`}>
                            <Chip
                              label={e.draftIssuanceCount === 1 ? 'Brouillon' : `${e.draftIssuanceCount} brouillons`}
                              color="warning"
                              size="small"
                              variant="outlined"
                              onClick={() => navigate(`/employees/${e.id}`)}
                              sx={{ cursor: 'pointer' }}
                            />
                          </Tooltip>
                        )}
                        <Tooltip title="Ouvrir le profil (gestion uniformes)">
                          <IconButton size="small" color="primary" onClick={() => navigate(`/employees/${e.id}`)}>
                            <CheckroomIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {!isLoading && employees.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, mt: 3 }}>
          <Typography variant="body2" color="text.secondary">
            Page {page} sur {totalPages} ({totalResults} {totalResults > 1 ? 'employés' : 'employé'}{searchActive ? ' trouvés' : ''})
          </Typography>
          {totalPages > 1 && (
            <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} color="primary" />
          )}
        </Box>
      )}

      {/* Ajouter un employé */}
      <Dialog open={addOpen} onClose={() => { setAddOpen(false); setDupChecked('idle'); }} maxWidth="sm" fullWidth>
        <DialogTitle>Ajouter un employé</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Prénom" fullWidth value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <TextField label="Nom" fullWidth value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField label="Courriel" fullWidth value={form.email}
              onChange={(e) => { setForm({ ...form, email: e.target.value }); setDupChecked('idle'); }} />
            <Tooltip title="Vérifier si ce courriel existe déjà (employés actifs, inactifs, candidats et prospects)">
              <span>
                <Button
                  variant="outlined"
                  sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                  disabled={!form.email.trim() || checkDuplicate.isPending}
                  onClick={() => checkDuplicate.mutate()}
                >
                  {checkDuplicate.isPending ? 'Vérification…' : 'Vérifier'}
                </Button>
              </span>
            </Tooltip>
          </Box>
          {dupChecked === 'none' && (
            <Alert severity="success">
              Aucun doublon trouvé pour « {form.email.trim()} » — vous pouvez créer l'employé.
            </Alert>
          )}
          <TextField label="Téléphone" fullWidth value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Statut</InputLabel>
              <Select label="Statut" value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <MenuItem value="ACTIF">Actif</MenuItem>
                <MenuItem value="INACTIF">Inactif</MenuItem>
              </Select>
            </FormControl>
            <TextField label="Date d'embauche" type="date" fullWidth InputLabelProps={{ shrink: true }}
              value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
          </Box>
          <TextField label="Poste" fullWidth value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value })} />
          <TextField label="Mandat / site" fullWidth value={form.assignment}
            onChange={(e) => setForm({ ...form, assignment: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddOpen(false); setDupChecked('idle'); }}>Annuler</Button>
          <Button variant="contained"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !form.firstName || !form.phone}>
            {createMutation.isPending ? 'Création…' : 'Créer'}
          </Button>
        </DialogActions>
      </Dialog>

      <ContactConflictDialog
        conflict={contactConflict}
        creatingIn="employee"
        onClose={() => setContactConflict(null)}
      />
    </Box>
  );
}
