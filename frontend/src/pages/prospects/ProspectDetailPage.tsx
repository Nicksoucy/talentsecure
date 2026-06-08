import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Button,
  Alert,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  ContactMail as ContactIcon,
  Transform as TransformIcon,
  Description as DescriptionIcon,
  VideoLibrary as VideoIcon,
  QuestionAnswer as AnswerIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { prospectService } from '@/services/prospect.service';
import { DetailPageSkeleton } from '@/components/skeletons';
import CVPreview from '@/components/CVPreview';
import ProspectVideoPlayer from '@/components/video/ProspectVideoPlayer';

export default function ProspectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['prospect', id],
    queryFn: () => prospectService.getProspectById(id!),
    enabled: !!id,
  });

  const prospect = data?.data;

  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    fullAddress: '', streetAddress: '', city: '', province: '', postalCode: '', country: '', notes: '',
  });

  const updateMutation = useMutation({
    mutationFn: () => prospectService.updateProspect(id!, form),
    onSuccess: () => {
      enqueueSnackbar('Fiche mise à jour', { variant: 'success' });
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ['prospect', id] });
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
    },
    onError: (e: any) =>
      enqueueSnackbar(
        e?.response?.data?.error || e?.response?.data?.message || 'Erreur lors de la mise à jour',
        { variant: 'error' }
      ),
  });

  const openEdit = () => {
    if (!prospect) return;
    setForm({
      firstName: prospect.firstName || '',
      lastName: prospect.lastName || '',
      email: prospect.email || '',
      phone: prospect.phone || '',
      fullAddress: prospect.fullAddress || '',
      streetAddress: (prospect as any).streetAddress || '',
      city: prospect.city || '',
      province: prospect.province || '',
      postalCode: prospect.postalCode || '',
      country: prospect.country || '',
      notes: prospect.notes || '',
    });
    setEditOpen(true);
  };

  if (isLoading) {
    return <DetailPageSkeleton hasBackButton sections={3} />;
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
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={openEdit}
          >
            Modifier
          </Button>
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
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* CV (aperçu inline) */}
        {(prospect.cvUrl || prospect.cvStoragePath) && (
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <DescriptionIcon color="primary" />
                  <Typography variant="h6">Curriculum Vitae</Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />
                <ProspectCvPreview prospectId={prospect.id} />
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Vidéo de présentation */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <VideoIcon color="primary" />
                <Typography variant="h6">Vidéo de présentation</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              {prospect.videoStoragePath ? (
                <ProspectVideoPlayer prospectId={prospect.id} />
              ) : (
                <ProspectRefreshVideoButton prospectId={prospect.id} />
              )}
            </CardContent>
          </Card>
        </Grid>


        {/* Réponses du formulaire */}
        {prospect.surveyAnswers && Object.keys(prospect.surveyAnswers).length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <AnswerIcon color="primary" />
                  <Typography variant="h6">Réponses du formulaire</Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />
                <Grid container spacing={2}>
                  {Object.entries(prospect.surveyAnswers).map(([k, v]) => {
                    const display =
                      v && typeof v === 'object'
                        ? (v as any).name || JSON.stringify(v)
                        : String(v ?? '');
                    if (!display.trim()) return null;
                    return (
                      <Grid item xs={12} sm={6} md={4} key={k}>
                        <Typography variant="body2" color="textSecondary">{k}</Typography>
                        <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>{display}</Typography>
                      </Grid>
                    );
                  })}
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        )}

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

      {/* Dialogue d'édition de la fiche */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Modifier la fiche</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Prénom" fullWidth value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <TextField label="Nom" fullWidth value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Courriel" fullWidth value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <TextField label="Téléphone" fullWidth value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Box>
          <TextField label="Adresse complète" fullWidth value={form.fullAddress}
            onChange={(e) => setForm({ ...form, fullAddress: e.target.value })} />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Ville" fullWidth value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              helperText="Normalisée automatiquement (ex. « montreal » → « Montréal »)" />
            <TextField label="Province" fullWidth value={form.province}
              onChange={(e) => setForm({ ...form, province: e.target.value })} />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Code postal" fullWidth value={form.postalCode}
              onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
            <TextField label="Pays" fullWidth value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </Box>
          <TextField label="Notes" fullWidth multiline rows={3} value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Annuler</Button>
          <Button
            variant="contained"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending || !form.firstName || !form.phone}
          >
            {updateMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/**
 * Bouton de récupération de la vidéo depuis GHL : pour les prospects créés
 * avant que le workflow GHL n'envoie video_url. Va chercher la vidéo dans le
 * contact GHL et la copie dans R2.
 */
function ProspectRefreshVideoButton({ prospectId }: { prospectId: string }) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => prospectService.refreshVideoFromGhl(prospectId),
    onSuccess: (res) => {
      enqueueSnackbar(res.alreadyHasVideo ? 'Vidéo déjà présente' : 'Vidéo récupérée !', { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['prospect', prospectId] });
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
    },
    onError: (e: any) => {
      const msg = e.response?.data?.error || e.response?.data?.message || e.message || 'Erreur lors de la récupération';
      enqueueSnackbar(msg, { variant: 'warning', autoHideDuration: 15000 });
    },
  });
  return (
    <Box sx={{ textAlign: 'center', py: 2 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Aucune vidéo stockée. Si la personne en a uploadé une dans le form, on peut la rapatrier depuis GHL.
      </Typography>
      <Button
        variant="outlined"
        startIcon={<VideoIcon />}
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Récupération…' : 'Récupérer la vidéo depuis GHL'}
      </Button>
    </Box>
  );
}

/** Aperçu inline du CV : récupère l'URL signée (R2) ou GHL puis affiche CVPreview. */
function ProspectCvPreview({ prospectId }: { prospectId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['prospect-cv-url', prospectId],
    queryFn: () => prospectService.getCvUrl(prospectId),
  });
  if (isLoading) return <Typography variant="body2" color="textSecondary">Chargement du CV…</Typography>;
  if (error || !data?.data?.url) return <Alert severity="info">CV indisponible.</Alert>;
  return (
    <Box sx={{ height: '60vh' }}>
      <CVPreview url={data.data.url} fileName="CV" />
    </Box>
  );
}
