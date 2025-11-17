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
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  Divider,
} from '@mui/material';
import {
  Logout as LogoutIcon,
  Person as PersonIcon,
  Visibility as VisibilityIcon,
  Business as BusinessIcon,
  Map as MapIcon,
  ViewModule as ViewModuleIcon,
  TravelExplore as TravelExploreIcon,
} from '@mui/icons-material';
import { useClientAuthStore } from '@/store/clientAuthStore';
import { clientAuthService, Catalogue } from '@/services/client-auth.service';
import { useSnackbar } from 'notistack';
import ProspectsMap from '@/components/client/ProspectsMap';
import ProspectsMapClustered from '@/components/client/ProspectsMapClustered';
import RequestCandidatesDialog from '@/components/client/RequestCandidatesDialog';

const ClientDashboardPage = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { client, accessToken, logout } = useClientAuthStore();
  const [catalogues, setCatalogues] = useState<Catalogue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapView, setMapView] = useState<'circles' | 'clusters'>('circles');
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [selectedCityRequest, setSelectedCityRequest] = useState<{ city: string; count: number } | null>(null);

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
      const errorMessage = err.response?.data?.error || 'Erreur lors du chargement des catalogues';
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

  const handleMapViewChange = (
    event: React.MouseEvent<HTMLElement>,
    newView: 'circles' | 'clusters'
  ) => {
    if (newView !== null) {
      setMapView(newView);
    }
  };

  const handleCityClick = (city: string, count: number) => {
    setSelectedCityRequest({ city, count });
    setRequestDialogOpen(true);
  };

  const handleRequestSubmit = (message: string) => {
    // In a real application, this would send the request to the backend
    console.log('Prospect request submitted:', {
      city: selectedCityRequest?.city,
      count: selectedCityRequest?.count,
      message,
      client: client?.name,
    });

    enqueueSnackbar(
      `Demande envoyée pour ${selectedCityRequest?.count} candidat${selectedCityRequest?.count! > 1 ? 's' : ''} potentiel${selectedCityRequest?.count! > 1 ? 's' : ''} à ${selectedCityRequest?.city}`,
      { variant: 'success' }
    );
  };

  const handleCloseRequestDialog = () => {
    setRequestDialogOpen(false);
    setSelectedCityRequest(null);
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

        {/* Prospects Map Section */}
        <Box sx={{ mb: 5 }}>
          <Box display="flex" alignItems="center" gap={2} mb={3}>
            <TravelExploreIcon color="primary" fontSize="large" />
            <Box>
              <Typography variant="h5" fontWeight="bold">
                Candidats potentiels disponibles
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Explorez notre banque de talents en temps réel par région
              </Typography>
            </Box>
          </Box>

          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Alert severity="info" sx={{ flexGrow: 1, mr: 2 }}>
              Visualisez la disponibilité des candidats par ville et demandez ceux qui vous intéressent
            </Alert>
            <ToggleButtonGroup
              value={mapView}
              exclusive
              onChange={handleMapViewChange}
              size="small"
            >
              <ToggleButton value="circles" aria-label="vue cercles">
                <MapIcon sx={{ mr: 1 }} fontSize="small" />
                Zones
              </ToggleButton>
              <ToggleButton value="clusters" aria-label="vue marqueurs">
                <ViewModuleIcon sx={{ mr: 1 }} fontSize="small" />
                Marqueurs
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {mapView === 'circles' && (
            <ProspectsMap onCityClick={handleCityClick} />
          )}
          {mapView === 'clusters' && (
            <ProspectsMapClustered onCityClick={handleCityClick} />
          )}
        </Box>

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

      {/* Request Candidates Dialog */}
      {selectedCityRequest && (
        <RequestCandidatesDialog
          open={requestDialogOpen}
          onClose={handleCloseRequestDialog}
          city={selectedCityRequest.city}
          count={selectedCityRequest.count}
          catalogueTitle="Candidats potentiels"
          onSubmit={handleRequestSubmit}
        />
      )}
    </Box>
  );
};

export default ClientDashboardPage;
