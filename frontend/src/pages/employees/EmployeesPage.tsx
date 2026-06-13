import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  Alert,
  Box,
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
import { Search as SearchIcon, Badge as BadgeIcon, Add as AddIcon, Checkroom as CheckroomIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { employeeService } from '@/services/employee.service';
import { useAuthStore } from '@/store/authStore';
import ContactConflictDialog from '@/components/ContactConflictDialog';
import { contactService, ContactConflict } from '@/services/contact.service';

function formatDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-CA');
}

const EMPTY_FORM = { firstName: '', lastName: '', email: '', phone: '', status: 'ACTIF', hireDate: '', position: '', assignment: '' };

export default function EmployeesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | 'ACTIF' | 'INACTIF'>('');
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

  const { data, isLoading } = useQuery({
    queryKey: ['employees', page, search, status],
    queryFn: () =>
      employeeService.getEmployees({
        page,
        limit: pageSize,
        search: search || undefined,
        status: status || undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
  });

  const { data: statsData } = useQuery({
    queryKey: ['employees', 'stats'],
    queryFn: () => employeeService.getEmployeesStats(),
  });

  const employees = data?.data ?? [];
  const totalPages = data?.pagination.totalPages ?? 1;
  const stats = statsData?.data;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BadgeIcon color="primary" />
          <Typography variant="h4" fontWeight="bold">
            Employés
          </Typography>
        </Box>
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
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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
        </CardContent>
      </Card>

      {/* Tableau */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nom</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Téléphone</TableCell>
              <TableCell>Ville</TableCell>
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
                <TableCell colSpan={isUniformStaff ? 9 : 8} align="center" sx={{ py: 6 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isUniformStaff ? 9 : 8} align="center" sx={{ py: 6 }}>
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
                      <Tooltip title="Ouvrir le profil (gestion uniformes)">
                        <IconButton size="small" color="primary" onClick={() => navigate(`/employees/${e.id}`)}>
                          <CheckroomIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} color="primary" />
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
