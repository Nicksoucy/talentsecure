import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Button,
  Alert,
  Skeleton,
  Avatar,
  Stack,
  Divider,
  Tooltip as MuiTooltip,
} from '@mui/material';
import {
  People as PeopleIcon,
  Star as StarIcon,
  Description as DescriptionIcon,
  TrendingUp as TrendingUpIcon,
  Map as MapIcon,
  PersonSearch as PersonSearchIcon,
  Badge as BadgeIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuthStore } from '@/store/authStore';
import CandidatesMap from '@/components/map/CandidatesMap';
import ProspectsMapClustered from '@/components/map/ProspectsMapClustered';
import { useProspectStats } from '@/hooks/useProspectStats';
import { useCandidateStats } from '@/hooks/useCandidateStats';
import { useDashboardOverview } from '@/hooks/useDashboardOverview';
import StatCard from './dashboard/StatCard';
import { activityVerb, activityVisual } from './dashboard/activityLabel';

const DashboardPage = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const {
    stats: prospectStats,
    isLoading: loadingProspects,
    error: prospectError,
    refetch: refetchProspects,
  } = useProspectStats();
  const {
    stats: candidateStats,
    isLoading: loadingCandidates,
    error: candidateError,
    refetch: refetchCandidates,
  } = useCandidateStats();
  const {
    overview,
    isLoading: loadingOverview,
    error: overviewError,
    refetch: refetchOverview,
  } = useDashboardOverview();

  const handleRefresh = () => {
    refetchProspects();
    refetchCandidates();
    refetchOverview();
  };

  const updatedAt = new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });

  // Données du donut "Candidats par statut"
  const statusData = candidateStats
    ? [
        { name: 'Élite (9.5+)', value: candidateStats.elite, color: '#f50057' },
        { name: 'Excellent (9-9.4)', value: candidateStats.excellent, color: '#4caf50' },
        { name: 'Très bon (8.5-8.9)', value: candidateStats.veryGood, color: '#2196f3' },
        { name: 'Bon (8-8.4)', value: candidateStats.good, color: '#ff9800' },
        { name: 'Qualifié (7-7.9)', value: candidateStats.qualified, color: '#9c27b0' },
        {
          name: 'Autres',
          value:
            (candidateStats.toReview || 0) +
            (candidateStats.pending || 0) +
            (candidateStats.absent || 0) +
            (candidateStats.inactive || 0),
          color: '#9e9e9e',
        },
      ].filter((d) => d.value > 0)
    : [];

  const anyError = prospectError || candidateError || overviewError;

  return (
    <Box>
      {/* En-tête */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          mb: 1,
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Bienvenue, {user?.firstName} !
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Tableau de bord — Vue d'ensemble de vos candidats et activités
          </Typography>
        </Box>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="caption" color="text.secondary">
            Mis à jour à {updatedAt}
          </Typography>
          <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={handleRefresh}>
            Actualiser
          </Button>
        </Stack>
      </Box>

      {anyError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Erreur de chargement : {prospectError?.message || candidateError?.message || (overviewError as any)?.message}
          <Button size="small" onClick={handleRefresh} sx={{ ml: 2 }}>
            Réessayer
          </Button>
        </Alert>
      )}

      {/* Rangée KPI */}
      <Grid container spacing={3} sx={{ mt: 1 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total candidats qualifiés"
            value={candidateStats?.total ?? 0}
            icon={<PeopleIcon sx={{ fontSize: 28 }} />}
            color="#1976d2"
            loading={loadingCandidates}
            onClick={() => navigate('/candidates')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Candidats Élite"
            value={candidateStats?.elite ?? 0}
            icon={<StarIcon sx={{ fontSize: 28 }} />}
            color="#f50057"
            subtitle="9.5+ /10"
            loading={loadingCandidates}
            onClick={() => navigate('/candidates')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Catalogues créés"
            value={overview?.catalogues.total ?? 0}
            icon={<DescriptionIcon sx={{ fontSize: 28 }} />}
            color="#4caf50"
            trend={
              overview && overview.catalogues.createdThisWeek > 0
                ? { label: `+${overview.catalogues.createdThisWeek} cette semaine`, positive: true }
                : undefined
            }
            loading={loadingOverview}
            onClick={() => navigate('/catalogues')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Candidats convertis"
            value={overview?.conversions.total ?? 0}
            icon={<TrendingUpIcon sx={{ fontSize: 28 }} />}
            color="#ff9800"
            trend={
              overview && overview.conversions.convertedThisMonth > 0
                ? { label: `+${overview.conversions.convertedThisMonth} ce mois`, positive: true }
                : undefined
            }
            loading={loadingOverview}
            onClick={() => navigate('/prospects')}
          />
        </Grid>
      </Grid>

      {/* Entonnoir prospects + Employés actifs */}
      <Grid container spacing={3} sx={{ mt: 0.5 }}>
        <Grid item xs={12} md={8}>
          <Card sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <PersonSearchIcon sx={{ mr: 1, color: '#2196f3' }} />
                <Typography variant="h6">Candidats Potentiels (Non interviewés)</Typography>
              </Box>
              {loadingProspects ? (
                <Skeleton variant="rounded" height={90} />
              ) : prospectStats ? (
                <>
                  <Grid container spacing={2}>
                    {[
                      { label: 'Total', value: prospectStats.total, color: 'primary.main' },
                      { label: 'À contacter', value: prospectStats.pending, color: 'warning.main' },
                      { label: 'Contactés', value: prospectStats.contacted, color: 'success.main' },
                      {
                        label: `Convertis (${prospectStats.conversionRate}%)`,
                        value: prospectStats.converted,
                        color: 'info.main',
                      },
                    ].map((item) => (
                      <Grid item xs={6} sm={3} key={item.label}>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography variant="h4" sx={{ color: item.color, fontWeight: 'bold' }}>
                            {item.value}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {item.label}
                          </Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                  {/* Barre segmentée À contacter / Contactés / Convertis */}
                  <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', mt: 3 }}>
                    {(() => {
                      const denom =
                        prospectStats.pending + prospectStats.contacted + prospectStats.converted || 1;
                      const seg = [
                        { v: prospectStats.pending, c: '#ed6c02' },
                        { v: prospectStats.contacted, c: '#2e7d32' },
                        { v: prospectStats.converted, c: '#0288d1' },
                      ];
                      return seg.map((s, i) => (
                        <Box key={i} sx={{ width: `${(s.v / denom) * 100}%`, backgroundColor: s.c }} />
                      ));
                    })()}
                  </Box>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Aucune donnée disponible
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <BadgeIcon sx={{ mr: 1, color: '#5e35b1' }} />
                <Typography variant="h6">Employés actifs</Typography>
              </Box>
              {loadingOverview ? (
                <Skeleton variant="rounded" height={90} />
              ) : overview ? (
                <Box>
                  <Typography variant="h3" fontWeight="bold" sx={{ color: '#5e35b1' }}>
                    {overview.employees.active}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    sur {overview.employees.total} employés au total
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={
                      overview.employees.total > 0
                        ? (overview.employees.active / overview.employees.total) * 100
                        : 0
                    }
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      mt: 1,
                      backgroundColor: '#ede7f6',
                      '& .MuiLinearProgress-bar': { backgroundColor: '#5e35b1' },
                    }}
                  />
                  <Button size="small" sx={{ mt: 1.5 }} onClick={() => navigate('/employees')}>
                    Voir les employés
                  </Button>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Aucune donnée disponible
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Candidats par statut (donut) + Activités récentes */}
      <Grid container spacing={3} sx={{ mt: 0.5 }}>
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Candidats par statut
              </Typography>
              {loadingCandidates ? (
                <Skeleton variant="rounded" height={260} />
              ) : statusData.length > 0 ? (
                <Box sx={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={2}
                      >
                        {statusData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Aucune donnée disponible
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Activités récentes
              </Typography>
              {loadingOverview ? (
                <Stack spacing={1.5} sx={{ mt: 1 }}>
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} variant="rounded" height={44} />
                  ))}
                </Stack>
              ) : overview && overview.recentActivity.length > 0 ? (
                <Stack divider={<Divider flexItem />} sx={{ mt: 1 }}>
                  {overview.recentActivity.map((a) => {
                    const { Icon, color } = activityVisual(a.action);
                    return (
                      <Box key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
                        <Avatar sx={{ width: 34, height: 34, bgcolor: `${color}1A`, color }}>
                          <Icon sx={{ fontSize: 18 }} />
                        </Avatar>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" noWrap>
                            <b>{a.user.name}</b> {activityVerb(a.action, a.resource)}
                          </Typography>
                          <MuiTooltip title={new Date(a.createdAt).toLocaleString('fr-CA')}>
                            <Typography variant="caption" color="text.secondary">
                              {formatDistanceToNow(new Date(a.createdAt), { locale: fr, addSuffix: true })}
                            </Typography>
                          </MuiTooltip>
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
              ) : (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Aucune activité récente pour le moment.
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Les activités apparaîtront ici dès que l'équipe utilise la plateforme.
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Cartes */}
      <Grid container spacing={3} sx={{ mt: 0.5 }}>
        <Grid item xs={12} lg={6}>
          <Card sx={{ borderRadius: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <MapIcon sx={{ mr: 1, color: '#1976d2' }} />
                <Typography variant="h6">Répartition — Candidats qualifiés</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" paragraph>
                Carte interactive du Québec montrant la distribution des candidats qualifiés par ville.
              </Typography>
              <CandidatesMap />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} lg={6}>
          <Card sx={{ borderRadius: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <PersonSearchIcon sx={{ mr: 1, color: '#2196f3' }} />
                <Typography variant="h6">Répartition — Candidats potentiels</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" paragraph>
                Carte interactive du Québec montrant la distribution des candidats potentiels par ville.
              </Typography>
              <ProspectsMapClustered />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
