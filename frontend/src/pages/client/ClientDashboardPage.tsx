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
  Tabs,
  Tab,
  Breadcrumbs,
  Link,
  Tooltip,
  Fab,
} from '@mui/material';
import {
  Logout as LogoutIcon,
  Visibility as VisibilityIcon,
  Business as BusinessIcon,
  TravelExplore as TravelExploreIcon,
  Home as HomeIcon,
  NavigateNext as NavigateNextIcon,
  Help as HelpIcon,
  Phone as PhoneIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  History as HistoryIcon,
  Assignment as AssignmentIcon,
} from '@mui/icons-material';
import { useClientAuthStore } from '@/store/clientAuthStore';
import { clientAuthService, Catalogue } from '@/services/client-auth.service';
import { useSnackbar } from 'notistack';
import UnifiedProspectsMap from '@/components/client/UnifiedProspectsMap';
import CartBadge from '@/components/client/Cart/CartBadge';
import CartDrawer from '@/components/client/Cart/CartDrawer';
import CitySelectDialog from '@/components/client/Cart/CitySelectDialog';
import ClientHelpDialog from '@/components/client/ClientHelpDialog';
import NotificationCenter from '@/components/client/NotificationCenter';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`client-tabpanel-${index}`}
      aria-labelledby={`client-tab-${index}`}
      {...other}
    >
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

const ClientDashboardPage = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { client, accessToken, logout } = useClientAuthStore();
  const [catalogues, setCatalogues] = useState<Catalogue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cityDialogOpen, setCityDialogOpen] = useState(false);
  const [selectedCity, setSelectedCity] = useState<{ city: string; province?: string } | null>(null);
  const [currentTab, setCurrentTab] = useState(0);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

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

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: darkMode ? 'grey.900' : '#f5f5f5' }}>
      {/* Header */}
      <AppBar position="sticky" elevation={2}>
        <Toolbar>
          <BusinessIcon sx={{ mr: 2 }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Portail Client - {client?.companyName || client?.name}
          </Typography>

          {/* Dark Mode Toggle */}
          <Tooltip title={darkMode ? 'Mode clair' : 'Mode sombre'}>
            <IconButton color="inherit" onClick={() => setDarkMode(!darkMode)}>
              {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>

          {/* Notifications */}
          <NotificationCenter />

          {/* Cart */}
          <CartBadge />

          {/* Help */}
          <Tooltip title="Centre d'aide">
            <IconButton color="inherit" onClick={() => setHelpDialogOpen(true)}>
              <HelpIcon />
            </IconButton>
          </Tooltip>

          {/* Logout */}
          <IconButton color="inherit" onClick={handleLogout} title="Déconnexion">
            <LogoutIcon />
          </IconButton>
        </Toolbar>

        {/* Breadcrumbs */}
        <Box sx={{ px: 3, py: 1, bgcolor: 'primary.dark' }}>
          <Breadcrumbs
            separator={<NavigateNextIcon fontSize="small" sx={{ color: 'white' }} />}
            aria-label="breadcrumb"
            sx={{ color: 'white' }}
          >
            <Link
              underline="hover"
              sx={{ display: 'flex', alignItems: 'center', color: 'white', cursor: 'pointer' }}
              onClick={() => setCurrentTab(0)}
            >
              <HomeIcon sx={{ mr: 0.5 }} fontSize="small" />
              Accueil
            </Link>
            <Typography sx={{ display: 'flex', alignItems: 'center', color: 'white' }}>
              {currentTab === 0 && 'Parcourir'}
              {currentTab === 1 && 'Mes Demandes'}
              {currentTab === 2 && 'Historique'}
            </Typography>
          </Breadcrumbs>
        </Box>

        {/* Tabs */}
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          sx={{
            bgcolor: 'background.paper',
            '& .MuiTab-root': { minHeight: 56 },
          }}
          variant="fullWidth"
        >
          <Tab
            icon={<TravelExploreIcon />}
            iconPosition="start"
            label="Parcourir"
            sx={{ fontWeight: 'bold' }}
          />
          <Tab
            icon={<AssignmentIcon />}
            iconPosition="start"
            label="Mes Demandes"
            sx={{ fontWeight: 'bold' }}
          />
          <Tab
            icon={<HistoryIcon />}
            iconPosition="start"
            label="Historique"
            sx={{ fontWeight: 'bold' }}
          />
        </Tabs>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 2 }}>
        {/* Tab 1: Browse/Parcourir */}
        <TabPanel value={currentTab} index={0}>
          {/* Welcome Section */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="h5" gutterBottom fontWeight="bold">
              Bienvenue, {client?.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Découvrez notre banque de talents et vos catalogues personnalisés
            </Typography>
          </Box>

          {/* Unified Map Section */}
          <Box sx={{ mb: 3 }}>
            <Box display="flex" alignItems="center" gap={1.5} mb={2}>
              <TravelExploreIcon color="primary" fontSize="medium" />
              <Box>
                <Typography variant="h6" fontWeight="bold">
                  Banque de Talents Disponibles
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Explorez nos candidats par ville - Basculez entre évalués et CVs seulement
                </Typography>
              </Box>
            </Box>

            <UnifiedProspectsMap onCityClick={handleCityClick} />
          </Box>
        </TabPanel>

        {/* Tab 2: My Requests */}
        <TabPanel value={currentTab} index={1}>
          <Divider sx={{ my: 2 }} />

          {/* Catalogues Section */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              Vos catalogues personnalisés
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Candidats sélectionnés spécialement pour vous
            </Typography>
          </Box>

          {/* Loading State */}
          {loading && (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
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
                  <Card elevation={2}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom fontWeight="bold">
                        {catalogue.title}
                      </Typography>
                      <Box display="flex" gap={1} mb={2} flexWrap="wrap">
                        <Chip
                          label={`${catalogue.candidateCount} candidats`}
                          size="small"
                          color="primary"
                        />
                        <Chip
                          label={new Date(catalogue.createdAt).toLocaleDateString('fr-CA')}
                          size="small"
                          variant="outlined"
                        />
                      </Box>
                      {catalogue.customMessage && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          {catalogue.customMessage.substring(0, 100)}
                          {catalogue.customMessage.length > 100 && '...'}
                        </Typography>
                      )}
                    </CardContent>
                    <CardActions>
                      <Button
                        size="small"
                        startIcon={<VisibilityIcon />}
                        onClick={() => handleViewCatalogue(catalogue.id)}
                      >
                        Voir le catalogue
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </TabPanel>

        {/* Tab 3: History */}
        <TabPanel value={currentTab} index={2}>
          <Box textAlign="center" py={8}>
            <HistoryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Historique des demandes
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Cette section affichera l'historique complet de vos demandes
            </Typography>
          </Box>
        </TabPanel>
      </Container>

      {/* Floating Contact Support Button */}
      <Tooltip title="Contacter le support" placement="left">
        <Fab
          color="secondary"
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
          }}
          href="tel:+15145551234"
        >
          <PhoneIcon />
        </Fab>
      </Tooltip>

      {/* Dialogs */}
      <CitySelectDialog
        open={cityDialogOpen}
        onClose={handleCloseCityDialog}
        city={selectedCity?.city || ''}
        province={selectedCity?.province}
      />

      <ClientHelpDialog
        open={helpDialogOpen}
        onClose={() => setHelpDialogOpen(false)}
      />

      <CartDrawer />
    </Box>
  );
};

export default ClientDashboardPage;
