import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  CircularProgress,
} from '@mui/material';
import {
  People as PeopleIcon,
  Star as StarIcon,
  Description as DescriptionIcon,
  TrendingUp as TrendingUpIcon,
  Map as MapIcon,
  PersonSearch as PersonSearchIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import CandidatesMap from '@/components/map/CandidatesMap';
import ProspectsMapClustered from '@/components/map/ProspectsMapClustered';
import { prospectService } from '@/services/prospect.service';

const DashboardPage = () => {
  const { user } = useAuthStore();

  // Fetch prospect stats
  const { data: prospectStatsData, isLoading: loadingProspects } = useQuery({
    queryKey: ['prospects', 'stats'],
    queryFn: () => prospectService.getProspectsStats(),
  });

  const prospectStats = prospectStatsData?.data;

  const stats = [
    {
      title: 'Total Candidats',
      value: '97',
      icon: <PeopleIcon sx={{ fontSize: 40 }} />,
      color: '#1976d2',
      change: '+12 ce mois',
    },
    {
      title: 'Candidats Élite',
      value: '15',
      icon: <StarIcon sx={{ fontSize: 40 }} />,
      color: '#f50057',
      change: '9.5+ /10',
    },
    {
      title: 'Catalogues créés',
      value: '24',
      icon: <DescriptionIcon sx={{ fontSize: 40 }} />,
      color: '#4caf50',
      change: '+3 cette semaine',
    },
    {
      title: 'Placements',
      value: '156',
      icon: <TrendingUpIcon sx={{ fontSize: 40 }} />,
      color: '#ff9800',
      change: '+8 ce mois',
    },
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        Bienvenue, {user?.firstName} !
      </Typography>

      <Typography variant="body1" color="text.secondary" paragraph>
        Tableau de bord - Vue d'ensemble de vos candidats et activités
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        {stats.map((stat, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card>
              <CardContent>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mb: 2,
                  }}
                >
                  <Box sx={{ color: stat.color }}>{stat.icon}</Box>
                  <Typography variant="h3" fontWeight="bold">
                    {stat.value}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {stat.title}
                </Typography>
                <Typography variant="caption" sx={{ color: stat.color }}>
                  {stat.change}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Prospect Stats Section */}
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <PersonSearchIcon sx={{ mr: 1, color: '#2196f3' }} />
                <Typography variant="h6">
                  Candidats Potentiels (Non interviewés)
                </Typography>
              </Box>
              {loadingProspects ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : prospectStats ? (
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h3" color="primary" fontWeight="bold">
                        {prospectStats.total}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Total
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h3" color="warning.main" fontWeight="bold">
                        {prospectStats.pending}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        À contacter
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h3" color="success.main" fontWeight="bold">
                        {prospectStats.contacted}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Contactés
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h3" color="info.main" fontWeight="bold">
                        {prospectStats.converted}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Convertis ({prospectStats.conversionRate}%)
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Aucune donnée disponible
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Candidats par statut
              </Typography>
              <Box sx={{ mt: 2 }}>
                {[
                  { label: 'ELITE (9.5+)', value: 15, total: 97, color: '#f50057' },
                  { label: 'EXCELLENT (9-9.4)', value: 28, total: 97, color: '#4caf50' },
                  { label: 'TRES_BON (8.5-8.9)', value: 32, total: 97, color: '#2196f3' },
                  { label: 'BON (8-8.4)', value: 22, total: 97, color: '#ff9800' },
                ].map((item, index) => (
                  <Box key={index} sx={{ mb: 2 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        mb: 0.5,
                      }}
                    >
                      <Typography variant="body2">{item.label}</Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {item.value}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={(item.value / item.total) * 100}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: '#e0e0e0',
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: item.color,
                        },
                      }}
                    />
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Activités récentes
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Aucune activité récente pour le moment.
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                  Les activités apparaîtront ici une fois que vous commencerez à utiliser la plateforme.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Maps Section */}
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <MapIcon sx={{ mr: 1, color: '#1976d2' }} />
                <Typography variant="h6">
                  Répartition - Candidats qualifiés
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" paragraph>
                Carte interactive du Québec montrant la distribution des candidats qualifiés par ville.
              </Typography>
              <CandidatesMap />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <PersonSearchIcon sx={{ mr: 1, color: '#2196f3' }} />
                <Typography variant="h6">
                  Répartition - Candidats potentiels
                </Typography>
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
