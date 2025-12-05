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
  List,
  ListItem,
  ListItemText,
  CircularProgress,
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
import SkillsExtractionPanel from '@/components/candidates/SkillsExtractionPanel';
import InterviewEvaluationForm, { InterviewFormData } from '../../components/InterviewEvaluationForm';
import { candidateFormSchema } from '../../validation/candidate';
import QuickOverview from '@/components/candidates/QuickOverview';
import CandidateBadges from '@/components/candidates/CandidateBadges';
import CandidateTabs, { CustomTabPanel } from './components/CandidateTabs';
import SimilarCandidates from './components/SimilarCandidates';

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
  const [initialFormData, setInitialFormData] = useState<InterviewFormData | null>(null);
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

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
      console.error('Erreur mise à jour candidat:', error);
      const serverError = error.response?.data?.error;
      const validationError = error.response?.data?.message;
      const details = error.response?.data?.details;

      let errorMessage = serverError || validationError || 'Erreur lors de la mise à jour';

      if (Array.isArray(details) && details.length > 0) {
        const detailMessages = details.map((d: any) => `${d.field}: ${d.message}`).join(', ');
        errorMessage += ` (${detailMessages})`;
      }

      enqueueSnackbar(errorMessage, {
        variant: 'error',
        autoHideDuration: 10000,
      });
    },
  });

  const handleOpenEdit = () => {
    if (candidate) {
      // Transform candidate data to form data
      const situationTests = candidate.situationTests || [];
      const situationTest1 = situationTests.find((t: any) => t.question?.includes('collègue') || t.question?.includes('collegue'))?.answer || '';
      const situationTest2 = situationTests.find((t: any) => t.question?.includes('urgence'))?.answer || '';
      const situationTest3 = situationTests.find((t: any) => t.question?.includes('sécurité') || t.question?.includes('securite'))?.answer || '';

      // Map availabilities to boolean flags
      const availabilities = candidate.availabilities || [];
      const availableDay = availabilities.some((a: any) => a.type === 'JOUR' && a.isAvailable);
      const availableEvening = availabilities.some((a: any) => a.type === 'SOIR' && a.isAvailable);
      const availableNight = availabilities.some((a: any) => a.type === 'NUIT' && a.isAvailable);
      const availableWeekend = availabilities.some((a: any) => a.type === 'FIN_DE_SEMAINE' && a.isAvailable);

      setInitialFormData({
        firstName: candidate.firstName || '',
        lastName: candidate.lastName || '',
        email: candidate.email || '',
        phone: candidate.phone || '',
        address: candidate.address || '',
        city: candidate.city || '',
        postalCode: candidate.postalCode || '',
        interviewDate: candidate.interviewDate ? new Date(candidate.interviewDate).toISOString().split('T')[0] : '',

        hasVehicle: candidate.hasVehicle || false,
        hasDriverLicense: candidate.hasDriverLicense || false,
        driverLicenseClass: candidate.driverLicenseClass || '',
        driverLicenseNumber: candidate.driverLicenseNumber || '',
        canTravelKm: candidate.canTravelKm || 0,

        hasBSP: candidate.hasBSP || false,
        bspNumber: candidate.bspNumber || '',
        bspExpiryDate: candidate.bspExpiryDate ? new Date(candidate.bspExpiryDate).toISOString().split('T')[0] : '',
        bspStatus: candidate.bspStatus || '',

        availableDay,
        availableEvening,
        availableNight,
        availableWeekend,
        canWorkUrgent: candidate.canWorkUrgent || false,

        languages: candidate.languages || [],

        professionalismRating: candidate.professionalismRating || 0,
        communicationRating: candidate.communicationRating || 0,
        appearanceRating: candidate.appearanceRating || 0,
        motivationRating: candidate.motivationRating || 0,
        experienceRating: candidate.experienceRating || 0,
        globalRating: candidate.globalRating || 0,

        experiences: (candidate.experiences || []).map(exp => ({
          companyName: exp.companyName,
          position: exp.position,
          startDate: exp.startDate || '',
          endDate: exp.endDate || '',
          description: exp.description || '',
          isCurrent: exp.isCurrent || false
        })),

        situationTest1,
        situationTest2,
        situationTest3,

        strengths: candidate.strengths || '',
        weaknesses: candidate.weaknesses || '',
        hrNotes: candidate.hrNotes || '',

        certifications: candidate.certifications || [],
      });
      setOpenEditDialog(true);
    }
  };

  const handleSaveEdit = (formData: InterviewFormData) => {
    const validationResult = candidateFormSchema.safeParse(formData);

    if (!validationResult.success) {
      const firstIssue = validationResult.error.issues[0];
      enqueueSnackbar(firstIssue?.message || 'Les informations saisies sont invalides.', { variant: 'error' });
      return;
    }

    const safeValues = validationResult.data;

    // Construct availabilities array from boolean flags
    const availabilities = [];
    if (formData.availableDay) availabilities.push({ type: 'JOUR', isAvailable: true });
    if (formData.availableEvening) availabilities.push({ type: 'SOIR', isAvailable: true });
    if (formData.availableNight) availabilities.push({ type: 'NUIT', isAvailable: true });
    if (formData.availableWeekend) availabilities.push({ type: 'FIN_DE_SEMAINE', isAvailable: true });

    const candidateData = {
      // Personal info
      firstName: safeValues.firstName,
      lastName: safeValues.lastName,
      email: safeValues.email,
      phone: safeValues.phone,
      address: safeValues.address,
      city: safeValues.city,
      postalCode: safeValues.postalCode,
      interviewDate: safeValues.interviewDate,

      // Transport
      hasVehicle: safeValues.hasVehicle,
      hasDriverLicense: safeValues.hasDriverLicense,
      driverLicenseClass: safeValues.driverLicenseClass,
      driverLicenseNumber: safeValues.driverLicenseNumber,
      canTravelKm: safeValues.canTravelKm,

      // Certifications
      hasBSP: safeValues.hasBSP,
      bspNumber: safeValues.bspNumber,
      bspExpiryDate: safeValues.bspExpiryDate,
      bspStatus: safeValues.bspStatus,

      // Ratings
      professionalismRating: safeValues.professionalismRating,
      communicationRating: safeValues.communicationRating,
      appearanceRating: safeValues.appearanceRating,
      motivationRating: safeValues.motivationRating,
      experienceRating: safeValues.experienceRating,
      globalRating: safeValues.globalRating,

      // Notes
      hrNotes: safeValues.hrNotes,
      strengths: safeValues.strengths,
      weaknesses: safeValues.weaknesses,

      // Nested data
      languages: safeValues.languages,
      experiences: safeValues.experiences,
      certifications: safeValues.certifications,
      availabilities: availabilities.length > 0 ? availabilities : undefined,
      canWorkUrgent: formData.canWorkUrgent,

      situationTests: [
        safeValues.situationTest1 && { question: 'Conflit avec un collegue', answer: safeValues.situationTest1 },
        safeValues.situationTest2 && { question: 'Situation d\'urgence inattendue', answer: safeValues.situationTest2 },
        safeValues.situationTest3 && { question: 'Assurer la securite d\'un site', answer: safeValues.situationTest3 },
      ].filter(Boolean),
    };

    updateMutation.mutate(candidateData);
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
            <Box display="flex" gap={1} mt={1} flexWrap="wrap">
              <Chip
                label={STATUS_LABELS[candidate.status] || candidate.status}
                color={STATUS_COLORS[candidate.status] || 'default'}
                size="small"
              />
              <CandidateBadges
                hasBSP={candidate.hasBSP}
                hasRCR={candidate.hasRCR}
                hasSSIAP={candidate.hasSSIAP}
                available24_7={candidate.available24_7}
                availableDays={candidate.availableDays}
                availableNights={candidate.availableNights}
                availableWeekends={candidate.availableWeekends}
                hasVehicle={candidate.hasVehicle}
                languages={candidate.languages}
                globalRating={candidate.globalRating}
                size="small"
              />
              {candidate.videoUrl && <Chip label="Vidéo disponible" color="info" size="small" icon={<VideoIcon />} />}
            </Box>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<EditIcon />} onClick={handleOpenEdit}>
          Modifier
        </Button>
      </Box>

      {/* Quick Overview Section */}
      <Box mb={3}>
        <QuickOverview candidate={candidate} />
      </Box>

      {/* Tabs System */}
      <CandidateTabs value={tabValue} onChange={handleTabChange}>
        {/* Tab 0: Vue d'ensemble */}
        <CustomTabPanel value={tabValue} index={0}>
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
            </Grid>

            {/* Right Column */}
            <Grid item xs={12} md={4}>
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

              {/* Similar Candidates (AI) */}
              {id && <SimilarCandidates currentCandidateId={id} />}
            </Grid>
          </Grid>
        </CustomTabPanel>

        {/* Tab 1: Expérience & Compétences */}
        <CustomTabPanel value={tabValue} index={1}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={8}>
              {/* Expériences Professionnelles */}
              {candidate.experiences && candidate.experiences.length > 0 ? (
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Box display="flex" alignItems="center" gap={1} mb={2}>
                      <Typography variant="h6" fontWeight="bold">
                        Expériences professionnelles
                      </Typography>
                    </Box>
                    <Divider sx={{ mb: 2 }} />

                    {candidate.experiences.map((exp, index) => (
                      <Box key={index} mb={3}>
                        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                          <Box>
                            <Typography variant="subtitle1" fontWeight="bold">
                              {exp.position}
                            </Typography>
                            <Typography variant="body1" color="primary.main">
                              {exp.companyName}
                            </Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {exp.startDate ? new Date(exp.startDate).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : ''}
                            {' - '}
                            {exp.isCurrent ? 'Présent' : (exp.endDate ? new Date(exp.endDate).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : '')}
                          </Typography>
                        </Box>
                        {exp.description && (
                          <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                            {exp.description}
                          </Typography>
                        )}
                        {index < (candidate.experiences?.length || 0) - 1 && <Divider sx={{ mt: 2 }} />}
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              ) : (
                <Alert severity="info" sx={{ mb: 3 }}>Aucune expérience renseignée.</Alert>
              )}

              {/* Skills Extraction Section */}
              <SkillsExtractionPanel
                candidateId={candidate.id}
                candidateName={`${candidate.firstName} ${candidate.lastName}`}
                hasCv={!!(candidate.cvUrl || candidate.cvStoragePath)}
                onSkillsUpdated={refetchCandidate}
              />
            </Grid>

            <Grid item xs={12} md={4}>
              {/* Langues */}
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <Typography variant="h6" fontWeight="bold">
                      Langues
                    </Typography>
                  </Box>
                  <Divider sx={{ mb: 2 }} />

                  {candidate.languages && candidate.languages.length > 0 ? (
                    <Box display="flex" flexWrap="wrap" gap={1}>
                      {candidate.languages.map((lang, index) => (
                        <Chip
                          key={index}
                          label={`${lang.language} - ${lang.level}`}
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">Aucune langue renseignée</Typography>
                  )}
                </CardContent>
              </Card>

              {/* Certifications */}
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <Typography variant="h6" fontWeight="bold">
                      Certifications
                    </Typography>
                  </Box>
                  <Divider sx={{ mb: 2 }} />

                  {candidate.certifications && candidate.certifications.length > 0 ? (
                    <List dense>
                      {candidate.certifications.map((cert, index) => (
                        <ListItem key={index}>
                          <ListItemText
                            primary={cert.name}
                            secondary={cert.expiryDate ? `Expire le: ${new Date(cert.expiryDate).toLocaleDateString('fr-FR')}` : undefined}
                          />
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <Typography variant="body2" color="text.secondary">Aucune certification renseignée</Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </CustomTabPanel>

        {/* Tab 2: Documents & Média */}
        <CustomTabPanel value={tabValue} index={2}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              {/* CV Upload */}
              <CVUpload
                candidateId={candidate.id}
                currentCV={{
                  cvUrl: candidate.cvUrl,
                  cvStoragePath: candidate.cvStoragePath,
                }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
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
        </CustomTabPanel>

        {/* Tab 3: Évaluation */}
        <CustomTabPanel value={tabValue} index={3}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
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
            </Grid>

            <Grid item xs={12} md={6}>
              {/* Mise en situation */}
              {candidate.situationTests && candidate.situationTests.length > 0 ? (
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight="bold" gutterBottom>
                      Mise en situation
                    </Typography>
                    <Divider sx={{ mb: 2 }} />

                    {candidate.situationTests.map((test, idx) => (
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
              ) : (
                <Alert severity="info">Aucun test de mise en situation.</Alert>
              )}
            </Grid>
          </Grid>
        </CustomTabPanel>
      </CandidateTabs>

      {/* Edit Dialog */}
      <Dialog
        open={openEditDialog}
        onClose={() => setOpenEditDialog(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: { minHeight: '90vh' }
        }}
      >
        <DialogTitle>Modifier le candidat</DialogTitle>
        <DialogContent>
          {initialFormData && (
            <InterviewEvaluationForm
              initialData={initialFormData}
              onSubmit={handleSaveEdit}
              onCancel={() => setOpenEditDialog(false)}
              isSubmitting={updateMutation.isPending}
              candidateId={candidate.id}
            />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default CandidateDetailPage;
