import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  Alert,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Paper,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  LocationOn as LocationIcon,
  CalendarToday as CalendarIcon,
  Star as StarIcon,
  VideoLibrary as VideoIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { candidateService } from '@/services/candidate.service';
import CVUpload from '@/components/CVUpload';
import VideoUpload from '@/components/video/VideoUpload';
import VideoPlayer from '@/components/video/VideoPlayer';
import { DetailPageSkeleton } from '@/components/skeletons';

const STATUS_COLORS: Record<string, 'success' | 'info' | 'warning' | 'error' | 'default'> = {
  ELITE: 'error',
  EXCELLENT: 'success',
  TRES_BON: 'info',
  BON: 'info',
  QUALIFIE: 'warning',
  EN_ATTENTE: 'default',
};

const STATUS_LABELS: Record<string, string> = {
  ELITE: 'Élite',
  EXCELLENT: 'Excellent',
  TRES_BON: 'Très bon',
  BON: 'Bon',
  QUALIFIE: 'Qualifié',
  A_REVOIR: 'À revoir',
  EN_ATTENTE: 'En attente',
  INACTIF: 'Inactif',
};

const CandidateDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [editData, setEditData] = useState({
    status: '',
    globalRating: '',
    hrNotes: '',
  });

  // Fetch candidate details
  const { data, isLoading, error } = useQuery({
    queryKey: ['candidate', id],
    queryFn: () => candidateService.getCandidateById(id!),
    enabled: !!id,
  });

  // Refetch candidate after video upload/delete
  const refetchCandidate = () => {
    queryClient.invalidateQueries({ queryKey: ['candidate', id] });
  };

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (updateData: any) => candidateService.updateCandidate(id!, updateData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', id] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      enqueueSnackbar('Candidat mis à jour avec succès !', { variant: 'success' });
      setOpenEditDialog(false);
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.error || 'Erreur lors de la mise à jour', {
        variant: 'error',
      });
    },
  });

  const handleOpenEdit = () => {
    if (candidate) {
      setEditData({
        status: candidate.status || '',
        globalRating: candidate.globalRating?.toString() || '',
        hrNotes: candidate.hrNotes || '',
      });
      setOpenEditDialog(true);
    }
  };

  const handleSaveEdit = () => {
    updateMutation.mutate({
      status: editData.status,
      globalRating: editData.globalRating ? parseFloat(editData.globalRating) : null,
      hrNotes: editData.hrNotes || null,
    });
  };

  if (isLoading) {
    return <DetailPageSkeleton hasBackButton sections={6} />;
  }

  if (error || !data?.data) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/candidates')} sx={{ mb: 3 }}>
          Retour à la liste
        </Button>
        <Alert severity="error">
          Erreur lors du chargement du candidat. Le candidat n'existe peut-être pas.
        </Alert>
      </Box>
    );
  }

  const candidate = data.data;

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={2}>
          <IconButton onClick={() => navigate('/candidates')}>
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h4" fontWeight="bold">
              {candidate.firstName} {candidate.lastName}
            </Typography>
            <Box display="flex" gap={1} mt={1}>
              <Chip
                label={STATUS_LABELS[candidate.status] || candidate.status}
                color={STATUS_COLORS[candidate.status] || 'default'}
                size="small"
              />
              {candidate.hasBSP && <Chip label="BSP" color="success" size="small" />}
              {candidate.videoUrl && <Chip label="Vidéo disponible" color="info" size="small" icon={<VideoIcon />} />}
            </Box>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<EditIcon />} onClick={handleOpenEdit}>
          Modifier
        </Button>
      </Box>

      <Grid container spacing={3}>
        {/* Left Column */}
        <Grid item xs={12} md={8}>
          {/* Personal Information */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Informations personnelles
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <EmailIcon color="action" />
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Email
                      </Typography>
                      <Typography variant="body1">
                        {candidate.email || 'Non renseigné'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <PhoneIcon color="action" />
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Téléphone
                      </Typography>
                      <Typography variant="body1">
                        {candidate.phone || 'Non renseigné'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <LocationIcon color="action" />
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Ville
                      </Typography>
                      <Typography variant="body1">
                        {candidate.city || 'Non renseignée'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <CalendarIcon color="action" />
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Date d'entretien
                      </Typography>
                      <Typography variant="body1">
                        {candidate.interviewDate
                          ? new Date(candidate.interviewDate).toLocaleDateString('fr-FR', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })
                          : 'Non planifié'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Notes RH */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <DescriptionIcon color="action" />
                <Typography variant="h6" fontWeight="bold">
                  Notes RH
                </Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />

              {candidate.hrNotes ? (
                <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50' }}>
                  <Typography variant="body1" style={{ whiteSpace: 'pre-wrap' }}>
                    {candidate.hrNotes}
                  </Typography>
                </Paper>
              ) : (
                <Typography variant="body2" color="text.secondary" fontStyle="italic">
                  Aucune note RH disponible
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* Video Section */}
          {candidate.videoUrl && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Box display="flex" alignItems="center" gap={1} mb={2}>
                  <VideoIcon color="action" />
                  <Typography variant="h6" fontWeight="bold">
                    Vidéo d'entretien
                  </Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />

                <Box
                  sx={{
                    position: 'relative',
                    paddingBottom: '56.25%', // 16:9 aspect ratio
                    height: 0,
                    overflow: 'hidden',
                    borderRadius: 1,
                    bgcolor: 'black',
                  }}
                >
                  <iframe
                    src={candidate.videoUrl}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      border: 'none',
                    }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="Vidéo d'entretien"
                  />
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Interview Details Sections */}
          {candidate.interviewDetails && (
            <>
              {/* Mise en situation */}
              {candidate.interviewDetails.situationTests && candidate.interviewDetails.situationTests.length > 0 && (
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight="bold" gutterBottom>
                      Mise en situation
                    </Typography>
                    <Divider sx={{ mb: 2 }} />

                    {candidate.interviewDetails.situationTests.map((test: any, idx: number) => (
                      <Box key={idx} mb={2}>
                        <Typography variant="subtitle2" fontWeight="bold" color="primary.main">
                          {test.question}
                        </Typography>
                        <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', mt: 1 }}>
                          <Typography variant="body2">{test.answer}</Typography>
                        </Paper>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Psychotechnique */}
              {candidate.interviewDetails.psychoTech && (
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight="bold" gutterBottom>
                      Psychotechnique
                    </Typography>
                    <Divider sx={{ mb: 2 }} />

                    {candidate.interviewDetails.psychoTech.motivation && (
                      <Box mb={2}>
                        <Typography variant="subtitle2" fontWeight="bold" color="primary.main">
                          Motivation par rapport au poste
                        </Typography>
                        <Typography variant="body2" mt={0.5}>
                          {candidate.interviewDetails.psychoTech.motivation}
                        </Typography>
                      </Box>
                    )}

                    {candidate.interviewDetails.psychoTech.goodAgent && (
                      <Box mb={2}>
                        <Typography variant="subtitle2" fontWeight="bold" color="primary.main">
                          Qu'est-ce qu'un bon agent de sécurité ?
                        </Typography>
                        <Typography variant="body2" mt={0.5}>
                          {candidate.interviewDetails.psychoTech.goodAgent}
                        </Typography>
                      </Box>
                    )}

                    {candidate.interviewDetails.psychoTech.badAgent && (
                      <Box mb={2}>
                        <Typography variant="subtitle2" fontWeight="bold" color="primary.main">
                          Qu'est-ce qu'un mauvais agent de sécurité ?
                        </Typography>
                        <Typography variant="body2" mt={0.5}>
                          {candidate.interviewDetails.psychoTech.badAgent}
                        </Typography>
                      </Box>
                    )}

                    {candidate.interviewDetails.psychoTech.mainTasks && (
                      <Box mb={2}>
                        <Typography variant="subtitle2" fontWeight="bold" color="primary.main">
                          Tâches principales d'un agent de sécurité
                        </Typography>
                        <Typography variant="body2" mt={0.5}>
                          {candidate.interviewDetails.psychoTech.mainTasks}
                        </Typography>
                      </Box>
                    )}

                    {candidate.interviewDetails.psychoTech.stayAwake && (
                      <Box mb={2}>
                        <Typography variant="subtitle2" fontWeight="bold" color="primary.main">
                          Comment rester éveillé la nuit ?
                        </Typography>
                        <Typography variant="body2" mt={0.5}>
                          {candidate.interviewDetails.psychoTech.stayAwake}
                        </Typography>
                      </Box>
                    )}

                    {candidate.interviewDetails.psychoTech.colleagueSleeping && (
                      <Box mb={2}>
                        <Typography variant="subtitle2" fontWeight="bold" color="primary.main">
                          Si un collègue dort sur le lieu de travail
                        </Typography>
                        <Typography variant="body2" mt={0.5}>
                          {candidate.interviewDetails.psychoTech.colleagueSleeping}
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Évaluation Générale */}
              {candidate.interviewDetails.evaluation && (
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight="bold" gutterBottom>
                      Évaluation générale
                    </Typography>
                    <Divider sx={{ mb: 2 }} />

                    <Grid container spacing={2}>
                      {candidate.interviewDetails.evaluation.attitude && (
                        <Grid item xs={12} sm={6}>
                          <Typography variant="caption" color="text.secondary">Attitude</Typography>
                          <Typography variant="body2">{candidate.interviewDetails.evaluation.attitude}</Typography>
                        </Grid>
                      )}

                      {candidate.interviewDetails.evaluation.communication && (
                        <Grid item xs={12} sm={6}>
                          <Typography variant="caption" color="text.secondary">Communication</Typography>
                          <Typography variant="body2">{candidate.interviewDetails.evaluation.communication}</Typography>
                        </Grid>
                      )}

                      {candidate.interviewDetails.evaluation.technology && (
                        <Grid item xs={12} sm={6}>
                          <Typography variant="caption" color="text.secondary">Technologie</Typography>
                          <Typography variant="body2">{candidate.interviewDetails.evaluation.technology}</Typography>
                        </Grid>
                      )}

                      {candidate.interviewDetails.evaluation.professionalism && (
                        <Grid item xs={12} sm={6}>
                          <Typography variant="caption" color="text.secondary">Professionnalisme</Typography>
                          <Typography variant="body2">{candidate.interviewDetails.evaluation.professionalism}</Typography>
                        </Grid>
                      )}

                      {candidate.interviewDetails.evaluation.punctuality && (
                        <Grid item xs={12} sm={6}>
                          <Typography variant="caption" color="text.secondary">Ponctualité / Présentation</Typography>
                          <Typography variant="body2">{candidate.interviewDetails.evaluation.punctuality}</Typography>
                        </Grid>
                      )}

                      {candidate.interviewDetails.evaluation.languagesUsed && (
                        <Grid item xs={12} sm={6}>
                          <Typography variant="caption" color="text.secondary">Langues utilisées</Typography>
                          <Typography variant="body2">{candidate.interviewDetails.evaluation.languagesUsed}</Typography>
                        </Grid>
                      )}
                    </Grid>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </Grid>

        {/* Right Column */}
        <Grid item xs={12} md={4}>
          {/* Evaluation */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <StarIcon color="action" />
                <Typography variant="h6" fontWeight="bold">
                  Évaluation
                </Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />

              <Box textAlign="center" py={2}>
                {candidate.globalRating ? (
                  <>
                    <Typography variant="h2" fontWeight="bold" color="primary.main">
                      {candidate.globalRating}
                      <Typography component="span" variant="h4" color="text.secondary">
                        /10
                      </Typography>
                    </Typography>
                    <Typography variant="body2" color="text.secondary" mt={1}>
                      Note globale
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary" fontStyle="italic">
                    Pas encore évalué
                  </Typography>
                )}
              </Box>

              {candidate.professionalismRating && (
                <Box mt={2}>
                  <Typography variant="caption" color="text.secondary">
                    Détails des notes
                  </Typography>
                  <Box mt={1}>
                    {candidate.professionalismRating && (
                      <Box display="flex" justifyContent="space-between" mb={1}>
                        <Typography variant="body2">Professionnalisme</Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {candidate.professionalismRating}/10
                        </Typography>
                      </Box>
                    )}
                    {candidate.communicationRating && (
                      <Box display="flex" justifyContent="space-between" mb={1}>
                        <Typography variant="body2">Communication</Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {candidate.communicationRating}/10
                        </Typography>
                      </Box>
                    )}
                    {candidate.appearanceRating && (
                      <Box display="flex" justifyContent="space-between" mb={1}>
                        <Typography variant="body2">Présentation</Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {candidate.appearanceRating}/10
                        </Typography>
                      </Box>
                    )}
                    {candidate.motivationRating && (
                      <Box display="flex" justifyContent="space-between" mb={1}>
                        <Typography variant="body2">Motivation</Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {candidate.motivationRating}/10
                        </Typography>
                      </Box>
                    )}
                    {candidate.experienceRating && (
                      <Box display="flex" justifyContent="space-between" mb={1}>
                        <Typography variant="body2">Expérience</Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {candidate.experienceRating}/10
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Additional Info */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Informations supplémentaires
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Box display="flex" justifyContent="space-between" mb={2}>
                <Typography variant="body2" color="text.secondary">
                  BSP
                </Typography>
                <Typography variant="body2" fontWeight="bold">
                  {candidate.hasBSP ? 'Oui' : 'Non'}
                </Typography>
              </Box>

              <Box display="flex" justifyContent="space-between" mb={2}>
                <Typography variant="body2" color="text.secondary">
                  Véhicule
                </Typography>
                <Typography variant="body2" fontWeight="bold">
                  {candidate.hasVehicle ? 'Oui' : 'Non'}
                </Typography>
              </Box>

              <Box display="flex" justifyContent="space-between" mb={2}>
                <Typography variant="body2" color="text.secondary">
                  Province
                </Typography>
                <Typography variant="body2" fontWeight="bold">
                  {candidate.province || 'N/A'}
                </Typography>
              </Box>

              {candidate.createdAt && (
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    Créé le
                  </Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {new Date(candidate.createdAt).toLocaleDateString('fr-FR')}
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* CV Upload */}
          <CVUpload
            candidateId={candidate.id}
            currentCV={{
              cvUrl: candidate.cvUrl,
              cvStoragePath: candidate.cvStoragePath,
            }}
          />

          {/* Video Section */}
          {candidate.videoStoragePath && (
            <VideoPlayer
              candidateId={candidate.id}
              candidateName={`${candidate.firstName} ${candidate.lastName}`}
            />
          )}

          <VideoUpload
            candidateId={candidate.id}
            currentVideoPath={candidate.videoStoragePath}
            onUploadSuccess={refetchCandidate}
            onDeleteSuccess={refetchCandidate}
          />
        </Grid>
      </Grid>

      {/* Edit Dialog */}
      <Dialog open={openEditDialog} onClose={() => setOpenEditDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Modifier le candidat</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Statut</InputLabel>
                <Select
                  value={editData.status}
                  label="Statut"
                  onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                >
                  <MenuItem value="EN_ATTENTE">En attente</MenuItem>
                  <MenuItem value="QUALIFIE">Qualifié</MenuItem>
                  <MenuItem value="BON">Bon</MenuItem>
                  <MenuItem value="TRES_BON">Très bon</MenuItem>
                  <MenuItem value="EXCELLENT">Excellent</MenuItem>
                  <MenuItem value="ELITE">Élite</MenuItem>
                  <MenuItem value="A_REVOIR">À revoir</MenuItem>
                  <MenuItem value="INACTIF">Inactif</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                type="number"
                label="Note globale (/10)"
                value={editData.globalRating}
                onChange={(e) => setEditData({ ...editData, globalRating: e.target.value })}
                inputProps={{ min: 0, max: 10, step: 0.1 }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={4}
                label="Notes RH"
                value={editData.hrNotes}
                onChange={(e) => setEditData({ ...editData, hrNotes: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenEditDialog(false)}>Annuler</Button>
          <Button
            variant="contained"
            onClick={handleSaveEdit}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? <CircularProgress size={24} /> : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CandidateDetailPage;
