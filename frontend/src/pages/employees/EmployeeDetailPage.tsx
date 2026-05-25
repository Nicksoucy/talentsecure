import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Grid, Chip, Button, Stack, Divider, CircularProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { employeeService } from '@/services/employee.service';
import { useAuthStore } from '@/store/authStore';
import UniformFichePanel from '../uniformes/components/UniformFichePanel';

function Info({ label, value }: { label: string; value?: any }) {
  return (
    <Grid item xs={12} sm={6} md={4}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2">{value ?? '—'}</Typography>
    </Grid>
  );
}

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('fr-CA') : '—');

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isUniformStaff = user?.role === 'ADMIN' || user?.role === 'RH_RECRUITER';

  const { data, isLoading } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => employeeService.getEmployeeById(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;
  }
  const e: any = data?.data;
  if (!e) return <Typography>Employé introuvable</Typography>;

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/employees')} sx={{ mb: 1 }}>
        Retour aux employés
      </Button>

      {/* En-tête profil */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
          <Typography variant="h5" fontWeight="bold">{e.firstName} {e.lastName}</Typography>
          <Chip
            label={e.status === 'ACTIF' ? 'Actif' : 'Inactif'}
            color={e.status === 'ACTIF' ? 'success' : 'default'}
          />
        </Stack>
        <Grid container spacing={2}>
          <Info label="Matricule" value={e.employeeNumber} />
          <Info label="Courriel" value={e.email} />
          <Info label="Téléphone" value={e.phone} />
          <Info label="Ville" value={e.city} />
          <Info label="Poste" value={e.position} />
          <Info label="Mandat / site" value={e.assignment} />
          <Info label="Date d'embauche" value={fmtDate(e.hireDate)} />
          <Info label="BSP" value={e.hasBSP ? (e.bspNumber || 'Oui') : 'Non'} />
          <Info label="Véhicule" value={e.hasVehicle ? 'Oui' : 'Non'} />
        </Grid>
      </Paper>

      {/* Gestion des uniformes */}
      <Divider sx={{ mb: 2 }}>
        <Typography variant="overline" color="text.secondary">Gestion des uniformes</Typography>
      </Divider>
      {isUniformStaff ? (
        <UniformFichePanel employeeId={id!} />
      ) : (
        <Typography color="text.secondary">Accès à la gestion des uniformes réservé (ADMIN / RH).</Typography>
      )}
    </Box>
  );
}
