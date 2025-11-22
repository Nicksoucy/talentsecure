import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  CircularProgress,
  Alert,
  AppBar,
  Toolbar,
  IconButton,
  Divider,
} from '@mui/material';
import {
  Logout as LogoutIcon,
  Person as PersonIcon,
  Visibility as VisibilityIcon,
  Business as BusinessIcon,
  TravelExplore as TravelExploreIcon,
} from '@mui/icons-material';
import { useClientAuthStore } from '@/store/clientAuthStore';
import { clientAuthService, Catalogue } from '@/services/client-auth.service';
import { useSnackbar } from 'notistack';
import ProspectsMap from '@/components/client/ProspectsMap';
import ProspectsOnlyMap from '@/components/client/ProspectsOnlyMap';
import CartBadge from '@/components/client/Cart/CartBadge';
import CartDrawer from '@/components/client/Cart/CartDrawer';
import CitySelectDialog from '@/components/client/Cart/CitySelectDialog';

const ClientDashboardPage = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { client, accessToken, logout } = useClientAuthStore();
  const [catalogues, setCatalogues] = useState<Catalogue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cityDialogOpen, setCityDialogOpen] = useState(false);
  const [selectedCity, setSelectedCity] = useState<{ city: string; province?: string } | null>(null);

  useEffect(() => {
    loadCatalogues();
  }, []);

  const loadCatalogues = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      setError(null);
      const data = await clientAuthService.getCatalogues(accessToken);
      setCatalogues(data);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Erreur lors du chargement des catalogues';
      setError(errorMessage);
      enqueueSnackbar(errorMessage, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    enqueueSnackbar('Déconnexion réussie', { variant: 'success' });
    navigate('/client/login');
  };

  const handleViewCatalogue = (catalogueId: string) => {
    navigate(`/client/catalogue/${catalogueId}`);
  };

  const handleCityClick = (city: string) => {
    setSelectedCity({ city, province: 'QC' });
    setCityDialogOpen(true);
  };

  const handleCloseCityDialog = () => {
    setCityDialogOpen(false);
    setSelectedCity(null);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
      {/* Header */}
      <AppBar position="static" elevation={1}>
        <Toolbar>
          <BusinessIcon sx={{ mr: 2 }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Portail Client - {client?.companyName || client?.name}
          </Typography>
          <CartBadge />
          <IconButton color="inherit" onClick={handleLogout} title="Déconnexion">
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Welcome Section */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" gutterBottom fontWeight="bold">
            Bienvenue, {client?.name}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Découvrez notre banque de talents et vos catalogues personnalisés
          </Typography>
        </Box>

        {/* Maps Section - Side by Side */}
        <Grid container spacing={3} sx={{ mb: 5 }}>
          {/* Tier 1: Evaluated Candidates (Premium) */}
          <Grid item xs={12} md={6}>
            <Box>
              <Box display="flex" alignItems="center" gap={2} mb={2}>
                <TravelExploreIcon color="primary" fontSize="large" />
                <Box>
                  <Typography variant="h6" fontWeight="bold">
                    Candidats Évalués
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Prêts à l'embauche
                  </Typography>
                </Box>
              </Box>

              <Alert severity="success" sx={{ mb: 2 }}>
                <strong>Premium 15-45$ par candidat</strong> - Avec vidéo d'entrevue, évaluations complètes et notes RH
              </Alert>

              <ProspectsMap onCityClick={handleCityClick} />
            </Box>
          </Grid>

          {/* Tier 2: Prospects Only (Economy) */}
          <Grid item xs={12} md={6}>
            <Box>
              <Box display="flex" alignItems="center" gap={2} mb={2}>
                <PersonIcon color="warning" fontSize="large" />
                <Box>
                  <Typography variant="h6" fontWeight="bold">
                    CVs Seulement
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Entrevues à faire
                  </Typography>
                </Box>
              </Box>

              <Alert severity="warning" sx={{ mb: 2 }}>
                <strong>Économique 5-10$ par CV</strong> - CVs uniquement, entrevue à votre charge. Parfait pour économiser!
              </Alert>

              <ProspectsOnlyMap onCityClick={handleCityClick} />
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 5 }} />

        {/* Catalogues Section */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" gutterBottom fontWeight="bold">
            Vos catalogues personnalisés
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Candidats sélectionnés spécialement pour vous
          </Typography>
        </Box>

        {/* Loading State */}
        {loading && (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
            <CircularProgress />
          </Box>
        )}

        {/* Error State */}
        {error && !loading && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Empty State */}
        {!loading && !error && catalogues.length === 0 && (
          <Alert severity="info">
            Aucun catalogue disponible pour le moment.
          </Alert>
        )}

        {/* Catalogues Grid */}
        {!loading && !error && catalogues.length > 0 && (
          <Grid container spacing={3}>
            {catalogues.map((catalogue) => (
              <Grid item xs={12} md={6} lg={4} key={catalogue.id}>
                <Card elevation={2} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" gutterBottom fontWeight="bold">
                      {catalogue.title}
                    </Typography>

                    {catalogue.customMessage && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {catalogue.customMessage}
                      </Typography>
                    )}

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                      <Chip
                        label={`${catalogue.items.length} candidat${catalogue.items.length > 1 ? 's' : ''}`}
                        color="primary"
                        size="small"
                      />
                      <Chip
                        label={catalogue.status}
                        size="small"
                        color={catalogue.status === 'ENVOYE' ? 'success' : 'default'}
                      />
                      {catalogue.requiresPayment && !catalogue.isPaid && (
                        <Chip
                          label="Paiement requis"
                          size="small"
                          color="warning"
                        />
                      )}
                      {catalogue.isContentRestricted && (
                        <Chip
                          label="Contenu restreint"
                          size="small"
                          color="warning"
                        />
                      )}
                    </Box>

                    <Typography variant="caption" color="text.secondary">
                      Créé le {new Date(catalogue.createdAt).toLocaleDateString()}
                    </Typography>
                  </CardContent>

                  <CardActions>
                    <Button
                      variant="contained"
                      fullWidth
                      startIcon={<VisibilityIcon />}
                      onClick={() => handleViewCatalogue(catalogue.id)}
                    >
                      Voir les candidats
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>

      {/* City Selection Dialog */}
      {selectedCity && (
        <CitySelectDialog
          open={cityDialogOpen}
          onClose={handleCloseCityDialog}
          city={selectedCity.city}
          province={selectedCity.province}
        />
      )}

      {/* Cart Drawer */}
      <CartDrawer />
    </Box>
  );
};

export default ClientDashboardPage;
