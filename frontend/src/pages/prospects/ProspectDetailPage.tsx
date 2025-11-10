import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  ContactMail as ContactIcon,
  Transform as TransformIcon,
} from '@mui/icons-material';
import { prospectService } from '@/services/prospect.service';

export default function ProspectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['prospect', id],
    queryFn: () => prospectService.getProspectById(id!),
    enabled: !!id,
  });

  const prospect = data?.data;

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !prospect) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Erreur lors du chargement du prospect
        </Alert>
      </Box>
    );
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('fr-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/prospects')}
          sx={{ mr: 2 }}
        >
          Retour
        </Button>
        <Typography variant="h4" component="h1">
          {prospect.firstName} {prospect.lastName}
        </Typography>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          {!prospect.isContacted && (
            <Button
              variant="outlined"
              startIcon={<ContactIcon />}
              onClick={() => navigate('/prospects')}
            >
              Marquer contacté
            </Button>
          )}
          {!prospect.isConverted && (
            <Button
              variant="contained"
              startIcon={<TransformIcon />}
              onClick={() => navigate(`/prospects/${prospect.id}/convert`)}
            >
              Convertir en candidat
            </Button>
          )}
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Personal Info */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Informations personnelles
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    Email
                  </Typography>
                  <Typography variant="body1">{prospect.email || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    Téléphone
                  </Typography>
                  <Typography variant="body1">{prospect.phone}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2" color="textSecondary">
                    Adresse complète
                  </Typography>
                  <Typography variant="body1">{prospect.fullAddress || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    Ville
                  </Typography>
                  <Typography variant="body1">{prospect.city || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    Province
                  </Typography>
                  <Typography variant="body1">{prospect.province || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    Code postal
                  </Typography>
                  <Typography variant="body1">{prospect.postalCode || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    Pays
                  </Typography>
                  <Typography variant="body1">{prospect.country || 'N/A'}</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Status Info */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Statut et suivi
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    Date de soumission
                  </Typography>
                  <Typography variant="body1">{formatDate(prospect.submissionDate)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    Fuseau horaire
                  </Typography>
                  <Typography variant="body1">{prospect.timezone || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    Contacté
                  </Typography>
                  {prospect.isContacted ? (
                    <Chip label="Oui" color="success" size="small" />
                  ) : (
                    <Chip label="Non" color="warning" size="small" />
                  )}
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    Date de contact
                  </Typography>
                  <Typography variant="body1">{formatDate(prospect.contactedAt)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    Converti
                  </Typography>
                  {prospect.isConverted ? (
                    <Chip label="Oui" color="info" size="small" />
                  ) : (
                    <Chip label="Non" color="default" size="small" />
                  )}
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    Date de conversion
                  </Typography>
                  <Typography variant="body1">{formatDate(prospect.convertedAt)}</Typography>
                </Grid>
                {prospect.cvUrl && (
                  <Grid item xs={12}>
                    <Typography variant="body2" color="textSecondary" gutterBottom>
                      CV
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      href={prospect.cvUrl}
                      target="_blank"
                    >
                      Télécharger CV
                    </Button>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Notes */}
        {prospect.notes && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Notes
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                  {prospect.notes}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
