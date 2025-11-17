import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Chip,
  Grid,
  Button,
  Divider,
  AppBar,
  Toolbar,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Logout as LogoutIcon,
  Person as PersonIcon,
  Star as StarIcon,
  Language as LanguageIcon,
  Work as WorkIcon,
  Download as DownloadIcon,
  Lock as LockIcon,
  Business as BusinessIcon,
  PlayCircle as PlayCircleIcon,
  Map as MapIcon,
  ViewModule as ViewModuleIcon,
} from '@mui/icons-material';
import { useClientAuthStore } from '@/store/clientAuthStore';
import { clientAuthService, CatalogueDetail } from '@/services/client-auth.service';
import { useSnackbar } from 'notistack';
import VideoPlayerModal from '@/components/client/VideoPlayerModal';
import CatalogueMap from '@/components/client/CatalogueMap';
import CatalogueMapClustered from '@/components/client/CatalogueMapClustered';
import RequestCandidatesDialog from '@/components/client/RequestCandidatesDialog';

const ClientCatalogueDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { client, accessToken, logout } = useClientAuthStore();
  const [catalogue, setCatalogue] = useState<CatalogueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<{ url: string; candidateName: string } | null>(null);
  const [mapView, setMapView] = useState<'circles' | 'clusters'>('circles');
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [selectedCityRequest, setSelectedCityRequest] = useState<{ city: string; count: number } | null>(null);

  useEffect(() => {
    if (id) {
      loadCatalogue();
    }
  }, [id]);

  const loadCatalogue = async () => {
    if (!accessToken || !id) return;

    try {
      setLoading(true);
      setError(null);
      const data = await clientAuthService.getCatalogueById(id, accessToken);
      setCatalogue(data);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Erreur lors du chargement du catalogue';
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

  const handleBack = () => {
    navigate('/client/dashboard');
  };

  const handleOpenVideo = (videoUrl: string, candidateName: string) => {
    setSelectedVideo({ url: videoUrl, candidateName });
    setVideoModalOpen(true);
  };

  const handleCloseVideo = () => {
    setVideoModalOpen(false);
    setSelectedVideo(null);
  };

  const handleCityClick = (city: string, count: number) => {
    setSelectedCityRequest({ city, count });
    setRequestDialogOpen(true);
  };

  const handleMapViewChange = (
    event: React.MouseEvent<HTMLElement>,
    newView: 'circles' | 'clusters'
  ) => {
    if (newView !== null) {
      setMapView(newView);
    }
  };

  const handleRequestSubmit = (message: string) => {
    // In a real application, this would send the request to the backend
    console.log('Request submitted:', {
      catalogueId: id,
      city: selectedCityRequest?.city,
      count: selectedCityRequest?.count,
      message,
      client: client?.name,
    });

    enqueueSnackbar(
      `Demande envoyée pour ${selectedCityRequest?.count} candidat${selectedCityRequest?.count! > 1 ? 's' : ''} à ${selectedCityRequest?.city}`,
      { variant: 'success' }
    );
  };

  const handleCloseRequestDialog = () => {
    setRequestDialogOpen(false);
    setSelectedCityRequest(null);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !catalogue) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error">{error || 'Catalogue non trouvé'}</Alert>
        <Button onClick={handleBack} sx={{ mt: 2 }}>
          Retour au tableau de bord
        </Button>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
      {/* Header */}
      <AppBar position="static" elevation={1}>
        <Toolbar>
          <IconButton color="inherit" onClick={handleBack} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <BusinessIcon sx={{ mr: 2 }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            {catalogue.title}
          </Typography>
          <IconButton color="inherit" onClick={handleLogout} title="Déconnexion">
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Catalogue Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" gutterBottom fontWeight="bold">
            {catalogue.title}
          </Typography>

          {catalogue.customMessage && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {catalogue.customMessage}
            </Alert>
          )}

          {catalogue.isContentRestricted && (
            <Alert severity="warning" icon={<LockIcon />} sx={{ mb: 2 }}>
              Certains détails sont masqués. Contactez-nous pour obtenir un accès complet.
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            <Chip
              label={`${catalogue.items.length} candidat${catalogue.items.length > 1 ? 's' : ''}`}
              color="primary"
            />
            <Chip label={catalogue.status} />
            {catalogue.requiresPayment && !catalogue.isPaid && (
              <Chip label="Paiement requis" color="warning" />
            )}
          </Box>
        </Box>

        {/* Geographic Map Section */}
        <Box sx={{ mb: 4 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h5" fontWeight="bold">
              Répartition géographique
            </Typography>
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

          {id && (
            <>
              {mapView === 'circles' && (
                <CatalogueMap catalogueId={id} onCityClick={handleCityClick} />
              )}
              {mapView === 'clusters' && (
                <CatalogueMapClustered catalogueId={id} onCityClick={handleCityClick} />
              )}
            </>
          )}
        </Box>

        {/* Candidates List */}
        <Typography variant="h5" gutterBottom fontWeight="bold" sx={{ mb: 3 }}>
          Candidats proposés
        </Typography>

        <Grid container spacing={3}>
          {catalogue.items.map((item) => (
            <Grid item xs={12} md={6} key={item.id}>
              <Card elevation={2}>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <PersonIcon color="primary" />
                      <Typography variant="h6" fontWeight="bold">
                        {item.candidate.firstName} {item.candidate.lastName}
                      </Typography>
                    </Box>
                    {item.candidate.globalRating && (
                      <Chip
                        icon={<StarIcon />}
                        label={`${item.candidate.globalRating}/10`}
                        color="success"
                        size="small"
                      />
                    )}
                  </Box>

                  <Typography color="text.secondary" gutterBottom>
                    📍 {item.candidate.city}, {item.candidate.province}
                  </Typography>

                  <Chip label={item.candidate.status} size="small" sx={{ mt: 1, mb: 2 }} />

                  <Divider sx={{ my: 2 }} />

                  {/* Languages */}
                  {item.candidate.languages && item.candidate.languages.length > 0 && (
                    <Box mb={2}>
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        <LanguageIcon fontSize="small" color="action" />
                        <Typography variant="subtitle2" fontWeight="bold">
                          Langues
                        </Typography>
                      </Box>
                      <Box display="flex" gap={1} flexWrap="wrap">
                        {item.candidate.languages.map((lang, idx) => (
                          <Chip
                            key={idx}
                            label={`${lang.language} (${lang.level})`}
                            size="small"
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    </Box>
                  )}

                  {/* Experience */}
                  {item.candidate.experiences && item.candidate.experiences.length > 0 && !catalogue.isContentRestricted && (
                    <Box mb={2}>
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        <WorkIcon fontSize="small" color="action" />
                        <Typography variant="subtitle2" fontWeight="bold">
                          Expérience récente
                        </Typography>
                      </Box>
                      {item.candidate.experiences.slice(0, 2).map((exp, idx) => (
                        <Typography key={idx} variant="body2" color="text.secondary">
                          • {exp.position} chez {exp.companyName}
                          {exp.durationMonths && ` (${exp.durationMonths} mois)`}
                        </Typography>
                      ))}
                    </Box>
                  )}

                  {/* Actions */}
                  <Box display="flex" gap={1} mt={2}>
                    {item.candidate.videoUrl && !catalogue.isContentRestricted && (
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<PlayCircleIcon />}
                        onClick={() => handleOpenVideo(
                          item.candidate.videoUrl!,
                          `${item.candidate.firstName} ${item.candidate.lastName}`
                        )}
                      >
                        Voir entrevue
                      </Button>
                    )}
                    {item.candidate.cvUrl && !catalogue.isContentRestricted && (
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<DownloadIcon />}
                        onClick={() => window.open(item.candidate.cvUrl!, '_blank')}
                      >
                        CV
                      </Button>
                    )}
                    {catalogue.isContentRestricted && (
                      <Button variant="outlined" size="small" startIcon={<LockIcon />} disabled>
                        Contenu verrouillé
                      </Button>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Footer */}
        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Alert severity="info">
            Pour plus d'informations ou pour procéder au recrutement, contactez-nous.
          </Alert>
        </Box>
      </Container>

      {/* Video Player Modal */}
      {selectedVideo && (
        <VideoPlayerModal
          open={videoModalOpen}
          onClose={handleCloseVideo}
          videoUrl={selectedVideo.url}
          candidateName={selectedVideo.candidateName}
        />
      )}

      {/* Request Candidates Dialog */}
      {selectedCityRequest && catalogue && (
        <RequestCandidatesDialog
          open={requestDialogOpen}
          onClose={handleCloseRequestDialog}
          city={selectedCityRequest.city}
          count={selectedCityRequest.count}
          catalogueTitle={catalogue.title}
          onSubmit={handleRequestSubmit}
        />
      )}
    </Box>
  );
};

export default ClientCatalogueDetailPage;
