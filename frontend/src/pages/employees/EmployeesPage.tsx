import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
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
} from '@mui/material';
import { Search as SearchIcon, Badge as BadgeIcon } from '@mui/icons-material';
import { employeeService } from '@/services/employee.service';

function formatDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-CA');
}

export default function EmployeesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | 'ACTIF' | 'INACTIF'>('');
  const pageSize = 20;

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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <BadgeIcon color="primary" />
        <Typography variant="h4" fontWeight="bold">
          Employés
        </Typography>
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
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">Aucun employé</Typography>
                </TableCell>
              </TableRow>
            ) : (
              employees.map((e) => (
                <TableRow key={e.id} hover>
                  <TableCell>{e.firstName} {e.lastName}</TableCell>
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
    </Box>
  );
}
