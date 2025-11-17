import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
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
  Paper,
  Button,
  Divider,
} from '@mui/material';
import {
  Person as PersonIcon,
  Star as StarIcon,
  Language as LanguageIcon,
  Work as WorkIcon,
  Download as DownloadIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import { publicCatalogueService, PublicCatalogue } from '@/services/public-catalogue.service';

export default function CatalogueViewPage() {
  const { token } = useParams<{ token: string }>();
  const [catalogue, setCatalogue] = useState<PublicCatalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      loadCatalogue();
    }
  }, [token]);

  const loadCatalogue = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await publicCatalogueService.getCatalogueByToken(token!);
      setCatalogue(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors du chargement du catalogue');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  if (!catalogue) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="warning">Catalogue non trouvé</Alert>
      </Container>
    );
  }

  return (
    <Box sx={{ bgcolor: '#f5f5f5', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="lg">
        {/* Header */}
        <Paper elevation={3} sx={{ p: 4, mb: 4 }}>
          <Typography variant="h3" gutterBottom fontWeight="bold">
            {catalogue.title}
          </Typography>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {catalogue.client.companyName || catalogue.client.name}
          </Typography>

          {catalogue.customMessage && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {catalogue.customMessage}
            </Alert>
          )}

          {catalogue.isContentRestricted && (
            <Alert severity="warning" icon={<LockIcon />} sx={{ mt: 2 }}>
              Certains détails sont masqués. Contactez-nous pour obtenir un accès complet.
            </Alert>
          )}

          <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Chip label={`${catalogue.items.length} candidat${catalogue.items.length > 1 ? 's' : ''}`} color="primary" />
            <Chip label={catalogue.status} />
          </Box>
        </Paper>

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
                        variant="outlined"
                        size="small"
                        onClick={() => window.open(item.candidate.videoUrl!, '_blank')}
                      >
                        Voir vidéo
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
        <Paper elevation={1} sx={{ p: 3, mt: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Pour plus d'informations ou pour procéder au recrutement, contactez-nous.
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}
