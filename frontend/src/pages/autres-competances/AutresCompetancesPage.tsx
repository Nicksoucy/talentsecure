import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  TextField,
  InputAdornment,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Avatar,
  IconButton,
  Tooltip,
  Button,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  Visibility as VisibilityIcon,
  WorkOutline as WorkIcon,
  Psychology as AiIcon,
  CloudUpload as UploadIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { prospectService } from '@/services/prospect.service';
import { skillsService, ExtractedSkill } from '@/services/skills.service';
import { useAuthStore } from '@/store/authStore';

const LEVEL_COLORS = {
  BEGINNER: 'default',
  INTERMEDIATE: 'primary',
  ADVANCED: 'success',
  EXPERT: 'error',
} as const;

const LEVEL_LABELS = {
  BEGINNER: 'Débutant',
  INTERMEDIATE: 'Intermédiaire',
  ADVANCED: 'Avancé',
  EXPERT: 'Expert',
} as const;

const AutresCompetancesPage = () => {
  const navigate = useNavigate();
  const { accessToken } = useAuthStore();
  const { enqueueSnackbar } = useSnackbar();
  const [searchTerm, setSearchTerm] = useState('');
  const [extractingCandidateId, setExtractingCandidateId] = useState<string | null>(null);
  const [extractedSkills, setExtractedSkills] = useState<ExtractedSkill[]>([]);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<'security' | 'other'>('other');
  const [currentCandidateName, setCurrentCandidateName] = useState('');
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchResults, setBatchResults] = useState<any>(null);
  const [batchLimit, setBatchLimit] = useState<number>(10); // Par défaut: 10 CVs

  // New states for search tab
  const [mainTab, setMainTab] = useState<'extraction' | 'search'>('extraction');
  const [skillSearchQuery, setSkillSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Fetch prospects (potential candidates) for extraction
  const { data: prospectsData, isLoading, refetch } = useQuery({
    queryKey: ['prospects', 'for-extraction'],
    queryFn: () => prospectService.getProspects({ isConverted: false, limit: 1000 }),
  });

  const prospects = prospectsData?.data || [];

  // Filter prospects by search term
  const filteredProspects = prospects.filter((prospect: any) =>
    `${prospect.firstName} ${prospect.lastName}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  // Separate skills into security-related and other
  const securitySkills = extractedSkills.filter(skill => skill.isSecurityRelated !== false);
  const otherSkills = extractedSkills.filter(skill => skill.isSecurityRelated === false);

  // Extract skills mutation
  const extractMutation = useMutation({
    mutationFn: (candidateId: string) => skillsService.extractSkills(candidateId, 'gpt-3.5-turbo', accessToken!),
    onSuccess: (data, candidateId) => {
      if (data.success) {
        setExtractedSkills(data.skillsFound);
        setShowResultsDialog(true);
        enqueueSnackbar(
          `${data.totalSkills} compétence${data.totalSkills > 1 ? 's' : ''} extraite${data.totalSkills > 1 ? 's' : ''} avec succès!`,
          { variant: 'success' }
        );
      } else {
        enqueueSnackbar(data.errorMessage || 'Erreur lors de l\'extraction', {
          variant: 'error',
        });
      }
      setExtractingCandidateId(null);
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error || 'Erreur lors de l\'extraction des compétences',
        { variant: 'error' }
      );
      setExtractingCandidateId(null);
    },
  });

  // Save skills mutation
  const saveMutation = useMutation({
    mutationFn: ({ candidateId, skills }: { candidateId: string, skills: any[] }) => {
      return skillsService.saveSkills(candidateId, skills, accessToken!);
    },
    onSuccess: () => {
      enqueueSnackbar('Compétences sauvegardées avec succès!', { variant: 'success' });
      setShowResultsDialog(false);
      refetch();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error || 'Erreur lors de la sauvegarde des compétences',
        { variant: 'error' }
      );
    },
  });

  // Batch extract mutation
  const batchExtractMutation = useMutation({
    mutationFn: (candidateIds: string[]) =>
      skillsService.batchExtractSkills(candidateIds, 'gpt-3.5-turbo', accessToken!),
    onSuccess: (data) => {
      setBatchResults(data);
      setShowBatchDialog(true);
      enqueueSnackbar(
        `Extraction terminée: ${data.summary.success}/${data.summary.total} réussies, ${data.summary.totalSkillsExtracted} compétences extraites`,
        { variant: 'success' }
      );
      refetch();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error || 'Erreur lors de l\'extraction batch',
        { variant: 'error' }
      );
    },
  });

  const handleExtractSkills = (candidateId: string, candidateName: string, hasCv: boolean) => {
    if (!hasCv) {
      enqueueSnackbar('Ce candidat n\'a pas de CV uploadé', { variant: 'warning' });
      return;
    }
    setExtractingCandidateId(candidateId);
    setCurrentCandidateName(candidateName);
    extractMutation.mutate(candidateId);
  };

  const handleSaveSkills = () => {
    if (!extractingCandidateId) return;
    const skills = extractedSkills.map(skill => ({
      name: skill.skillName,
      level: skill.level,
      yearsExperience: skill.yearsExperience,
    }));
    saveMutation.mutate({ candidateId: extractingCandidateId, skills });
  };

  const handleViewProspect = (id: string) => {
    navigate(`/prospects/${id}`);
  };

  const handleBatchExtract = () => {
    const prospectsWithCv = prospects.filter((p: any) => p.cvUrl || p.cvStoragePath);
    if (prospectsWithCv.length === 0) {
      enqueueSnackbar('Aucun candidat avec CV disponible', { variant: 'warning' });
      return;
    }

    // Limiter le nombre de CVs selon batchLimit (0 = tous)
    const limitedProspects = batchLimit > 0
      ? prospectsWithCv.slice(0, batchLimit)
      : prospectsWithCv;

    const count = limitedProspects.length;
    const estimatedCost = (count * 0.001).toFixed(2);
    const estimatedTime = Math.ceil(count * 2 / 60); // ~2 sec per extraction

    const confirmed = window.confirm(
      `⚠️ ATTENTION - Extraction en masse\n\n` +
      `Candidats à traiter: ${count}${batchLimit > 0 && prospectsWithCv.length > batchLimit ? ` sur ${prospectsWithCv.length}` : ''}\n` +
      `Coût estimé: ~$${estimatedCost} USD\n` +
      `Temps estimé: ~${estimatedTime} minutes\n\n` +
      `⚠️ Les candidats déjà traités seront ignorés.\n\n` +
      `Voulez-vous continuer?`
    );

    if (!confirmed) {
      return;
    }

    const candidateIds = limitedProspects.map((p: any) => p.id);
    batchExtractMutation.mutate(candidateIds);
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'success.main';
    if (confidence >= 0.6) return 'warning.main';
    return 'error.main';
  };

  // Auto-load all skills when switching to search tab
  useEffect(() => {
    if (mainTab === 'search' && accessToken) {
      loadAllSkills();
    }
  }, [mainTab, accessToken]);

  const loadAllSkills = async () => {
    setIsSearching(true);
    try {
      const results = await skillsService.searchSkills(
        '', // Empty query to get all skills
        undefined, // category
        0.3, // Lower confidence threshold to get more results
        accessToken!
      );
      setSearchResults(results.results || []);
      if (results.results.length > 0) {
        enqueueSnackbar(
          `${results.count} compétence${results.count > 1 ? 's' : ''} chargée${results.count > 1 ? 's' : ''}`,
          { variant: 'success' }
        );
      }
    } catch (error: any) {
      console.error('Error loading skills:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSkillSearch = async () => {
    setIsSearching(true);
    try {
      const results = await skillsService.searchSkills(
        skillSearchQuery,
        undefined, // category
        0.3, // minConfidence
        accessToken!
      );
      setSearchResults(results.results || []);
      if (results.results.length === 0) {
        enqueueSnackbar('Aucun résultat trouvé', { variant: 'info' });
      } else {
        enqueueSnackbar(
          `${results.count} compétence${results.count > 1 ? 's' : ''} trouvée${results.count > 1 ? 's' : ''}`,
          { variant: 'success' }
        );
      }
    } catch (error: any) {
      enqueueSnackbar(
        error.response?.data?.error || 'Erreur lors de la recherche',
        { variant: 'error' }
      );
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            Autre Compétance
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Candidats avec des compétences hors du secteur de la sécurité
          </Typography>
        </Box>
      </Box>

      {/* Main Tabs: Extraction vs Search */}
      <Card sx={{ mb: 3 }}>
        <Tabs
          value={mainTab}
          onChange={(_, newValue) => setMainTab(newValue)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab
            label="📤 Extraction de CVs"
            value="extraction"
          />
          <Tab
            label="🔍 Recherche de Compétences"
            value="search"
          />
        </Tabs>
      </Card>

      {mainTab === 'extraction' && (
      <Box>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Box display="flex" gap={2} alignItems="center">
          <Box display="flex" gap={1}>
            <Button
              size="small"
              variant={batchLimit === 10 ? 'contained' : 'outlined'}
              onClick={() => setBatchLimit(10)}
              disabled={batchExtractMutation.isPending}
            >
              10
            </Button>
            <Button
              size="small"
              variant={batchLimit === 50 ? 'contained' : 'outlined'}
              onClick={() => setBatchLimit(50)}
              disabled={batchExtractMutation.isPending}
            >
              50
            </Button>
            <Button
              size="small"
              variant={batchLimit === 100 ? 'contained' : 'outlined'}
              onClick={() => setBatchLimit(100)}
              disabled={batchExtractMutation.isPending}
            >
              100
            </Button>
            <Button
              size="small"
              variant={batchLimit === 0 ? 'contained' : 'outlined'}
              onClick={() => setBatchLimit(0)}
              disabled={batchExtractMutation.isPending}
            >
              Tous
            </Button>
          </Box>
          <Button
            variant="contained"
            color="primary"
            size="large"
            startIcon={batchExtractMutation.isPending ? <CircularProgress size={20} color="inherit" /> : <AiIcon />}
            onClick={handleBatchExtract}
            disabled={batchExtractMutation.isPending || isLoading}
            sx={{ fontWeight: 'bold' }}
          >
            {batchExtractMutation.isPending
              ? 'Extraction en cours...'
              : `Extraire ${batchLimit > 0 ? batchLimit : 'Tous'} CV${batchLimit !== 1 ? 's' : ''}`}
          </Button>
        </Box>
      </Box>

      {/* AI Extraction Section */}
      <Card sx={{ mb: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <AiIcon sx={{ mr: 1.5, color: 'white', fontSize: 32 }} />
              <Box>
                <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
                  Extraction IA pour Autre Compétance
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                  Identifiez les candidats avec des compétences hors sécurité en analysant leurs CVs
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip
                label="~$0.001 / extraction"
                sx={{
                  bgcolor: 'rgba(255,255,255,0.2)',
                  color: 'white',
                  fontWeight: 'bold'
                }}
              />
              <Chip
                label={`${prospects.filter((p: any) => p.cvUrl || p.cvStoragePath).length} CVs disponibles`}
                sx={{
                  bgcolor: 'rgba(255,255,255,0.2)',
                  color: 'white',
                  fontWeight: 'bold'
                }}
              />
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <WorkIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {filteredProspects.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Candidats Potentiels
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <WorkIcon sx={{ fontSize: 40, color: 'success.main' }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    0
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    IT & Technologies
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <WorkIcon sx={{ fontSize: 40, color: 'warning.main' }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    0
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Service & Vente
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <WorkIcon sx={{ fontSize: 40, color: 'info.main' }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    0
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Autres Secteurs
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Search Bar */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <TextField
            fullWidth
            placeholder="Rechercher par nom de candidat..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
        </CardContent>
      </Card>

      {/* Candidates Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Liste des Candidats - Autre Compétance
          </Typography>

          {isLoading ? (
            <Box display="flex" justifyContent="center" p={4}>
              <Typography>Chargement...</Typography>
            </Box>
          ) : filteredProspects.length === 0 ? (
            <Box textAlign="center" py={4}>
              <Typography variant="body1" color="text.secondary">
                Aucun candidat potentiel trouvé.
              </Typography>
              <Typography variant="body2" color="text.secondary" mt={1}>
                Utilisez l'extraction IA pour identifier les compétences des candidats potentiels.
              </Typography>
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Candidat Potentiel</TableCell>
                    <TableCell>Ville</TableCell>
                    <TableCell>CV</TableCell>
                    <TableCell>Date de soumission</TableCell>
                    <TableCell>Contacté</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredProspects.map((prospect: any) => {
                    const hasCv = !!(prospect.cvUrl || prospect.cvStoragePath);
                    const isExtracting = extractingCandidateId === prospect.id;

                    return (
                      <TableRow key={prospect.id} hover>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={2}>
                            <Avatar>
                              {prospect.firstName[0]}
                              {prospect.lastName[0]}
                            </Avatar>
                            <Box>
                              <Typography variant="body2" fontWeight="bold">
                                {prospect.firstName} {prospect.lastName}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {prospect.email}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {prospect.city}, {prospect.province}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {hasCv ? (
                            <Chip
                              icon={<UploadIcon />}
                              label="CV Disponible"
                              size="small"
                              color="success"
                              variant="outlined"
                            />
                          ) : (
                            <Chip
                              label="Aucun CV"
                              size="small"
                              color="default"
                              variant="outlined"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {prospect.submissionDate
                              ? new Date(prospect.submissionDate).toLocaleDateString('fr-CA')
                              : 'N/A'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {prospect.isContacted ? (
                            <Chip
                              label="Contacté"
                              size="small"
                              color="success"
                              variant="outlined"
                            />
                          ) : (
                            <Chip
                              label="Non contacté"
                              size="small"
                              color="default"
                              variant="outlined"
                            />
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Box display="flex" gap={1} justifyContent="flex-end">
                            <Tooltip title={hasCv ? "Extraire les compétences" : "Aucun CV disponible"}>
                              <span>
                                <IconButton
                                  size="small"
                                  color="primary"
                                  disabled={!hasCv || isExtracting}
                                  onClick={() => handleExtractSkills(
                                    prospect.id,
                                    `${prospect.firstName} ${prospect.lastName}`,
                                    hasCv
                                  )}
                                >
                                  {isExtracting ? (
                                    <CircularProgress size={20} />
                                  ) : (
                                    <AiIcon fontSize="small" />
                                  )}
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Voir le profil">
                              <IconButton
                                size="small"
                                onClick={() => handleViewProspect(prospect.id)}
                              >
                                <VisibilityIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Extraction Results Dialog */}
      <Dialog
        open={showResultsDialog}
        onClose={() => setShowResultsDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">
              Compétences Extraites - {currentCandidateName}
            </Typography>
            <Box display="flex" gap={1}>
              <Chip
                label={`${securitySkills.length} Sécurité`}
                color="primary"
                size="small"
              />
              <Chip
                label={`${otherSkills.length} Autre`}
                color="default"
                size="small"
              />
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          {otherSkills.length > 0 && (
            <Alert severity="success" sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>{otherSkills.length}</strong> compétence{otherSkills.length > 1 ? 's' : ''} non liée{otherSkills.length > 1 ? 's' : ''} à la sécurité {otherSkills.length > 1 ? 'ont' : 'a'} été trouvée{otherSkills.length > 1 ? 's' : ''} !
              </Typography>
            </Alert>
          )}

          <Tabs
            value={activeTab}
            onChange={(_, newValue) => setActiveTab(newValue)}
            sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
          >
            <Tab
              label={`Autre Compétance (${otherSkills.length})`}
              value="other"
            />
            <Tab
              label={`Compétences Sécurité (${securitySkills.length})`}
              value="security"
            />
          </Tabs>

          <List>
            {(activeTab === 'other' ? otherSkills : securitySkills).map((skill, index) => (
              <Box key={index}>
                <ListItem
                  sx={{
                    bgcolor: 'grey.50',
                    borderRadius: 1,
                    mb: 1,
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                  }}
                >
                  <Box display="flex" justifyContent="space-between" width="100%" mb={1}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {skill.skillName}
                    </Typography>
                    <Box display="flex" gap={1}>
                      <Chip
                        label={LEVEL_LABELS[skill.level]}
                        color={LEVEL_COLORS[skill.level]}
                        size="small"
                      />
                      {skill.yearsExperience && (
                        <Chip
                          label={`${skill.yearsExperience} an${skill.yearsExperience > 1 ? 's' : ''}`}
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Box>
                  </Box>

                  <Box width="100%" mb={1}>
                    <Box display="flex" justifyContent="space-between" mb={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        Confiance
                      </Typography>
                      <Typography variant="caption" fontWeight="bold">
                        {(skill.confidence * 100).toFixed(0)}%
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={skill.confidence * 100}
                      sx={{
                        height: 6,
                        borderRadius: 3,
                        bgcolor: 'grey.200',
                        '& .MuiLinearProgress-bar': {
                          bgcolor: getConfidenceColor(skill.confidence),
                        },
                      }}
                    />
                  </Box>

                  {skill.reasoning && (
                    <Box
                      sx={{
                        bgcolor: 'grey.100',
                        p: 1,
                        borderRadius: 1,
                        width: '100%',
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        <strong>Raisonnement:</strong> {skill.reasoning}
                      </Typography>
                    </Box>
                  )}
                </ListItem>
              </Box>
            ))}
          </List>

          {(activeTab === 'other' ? otherSkills : securitySkills).length === 0 && (
            <Alert severity="info">
              {activeTab === 'other'
                ? "Aucune compétence non liée à la sécurité n'a été trouvée dans ce CV."
                : "Aucune compétence liée à la sécurité n'a été trouvée dans ce CV."}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowResultsDialog(false)}>Fermer</Button>
          <Button
            variant="contained"
            color="primary"
            disabled={extractedSkills.length === 0 || saveMutation.isPending}
            onClick={handleSaveSkills}
          >
            {saveMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder les Compétences'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Batch Extraction Results Dialog */}
      <Dialog
        open={showBatchDialog}
        onClose={() => setShowBatchDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Typography variant="h6">Résultats de l'Extraction Batch</Typography>
        </DialogTitle>
        <DialogContent>
          {batchResults && (
            <>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={3}>
                  <Card sx={{ bgcolor: 'primary.light', color: 'white' }}>
                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                      <Typography variant="h3" fontWeight="bold">
                        {batchResults.summary.total}
                      </Typography>
                      <Typography variant="body2">Total</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Card sx={{ bgcolor: 'success.light', color: 'white' }}>
                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                      <Typography variant="h3" fontWeight="bold">
                        {batchResults.summary.processed || 0}
                      </Typography>
                      <Typography variant="body2">Traités</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Card sx={{ bgcolor: 'warning.light', color: 'white' }}>
                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                      <Typography variant="h3" fontWeight="bold">
                        {batchResults.summary.skipped || 0}
                      </Typography>
                      <Typography variant="body2">Ignorés</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Card sx={{ bgcolor: 'error.light', color: 'white' }}>
                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                      <Typography variant="h3" fontWeight="bold">
                        {batchResults.summary.failed}
                      </Typography>
                      <Typography variant="body2">Échecs</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12}>
                  <Card sx={{ bgcolor: 'info.light', color: 'white' }}>
                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                      <Typography variant="h2" fontWeight="bold">
                        {batchResults.summary.totalSkillsExtracted}
                      </Typography>
                      <Typography variant="body1">Compétences Totales Extraites</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Alert severity="success" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  <strong>{batchResults.message}</strong>
                </Typography>
              </Alert>

              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Détails par candidat:
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Candidat ID</TableCell>
                      <TableCell>Statut</TableCell>
                      <TableCell align="right">Compétences</TableCell>
                      <TableCell>Message</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {batchResults.results.map((result: any, index: number) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                            {result.candidateId.substring(0, 8)}...
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {result.success ? (
                            <Chip label="Succès" color="success" size="small" />
                          ) : (
                            <Chip label="Échec" color="error" size="small" />
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {result.skillsFound || 0}
                        </TableCell>
                        <TableCell>
                          {result.error && (
                            <Typography variant="caption" color="error">
                              {result.error}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBatchDialog(false)} variant="contained">
            Fermer
          </Button>
        </DialogActions>
      </Dialog>
      </Box>
      )}

      {/* Search Tab */}
      {mainTab === 'search' && (
        <Box>
          {/* Summary Card */}
          {searchResults.length > 0 && (
            <Card sx={{ mb: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <CardContent>
                <Grid container spacing={3}>
                  <Grid item xs={12} sm={4}>
                    <Box textAlign="center">
                      <Typography variant="h3" sx={{ color: 'white', fontWeight: 'bold' }}>
                        {searchResults.length}
                      </Typography>
                      <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                        Compétences Extraites
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Box textAlign="center">
                      <Typography variant="h3" sx={{ color: 'white', fontWeight: 'bold' }}>
                        {searchResults.reduce((acc: number, r: any) => acc + r.totalCandidates, 0)}
                      </Typography>
                      <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                        Candidats Totaux
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Box textAlign="center">
                      <Typography variant="h3" sx={{ color: 'white', fontWeight: 'bold' }}>
                        {[...new Set(searchResults.map((r: any) => r.category))].length}
                      </Typography>
                      <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                        Catégories
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          {/* Search Filter */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                🔍 Filtrer les Compétences
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Toutes les compétences extraites sont affichées ci-dessous. Utilisez le filtre pour rechercher une compétence spécifique.
              </Typography>
              <TextField
                fullWidth
                placeholder="Filtrer par nom (optionnel)..."
                value={skillSearchQuery}
                onChange={(e) => setSkillSearchQuery(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSkillSearch();
                  }
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <Button
                        variant="contained"
                        onClick={handleSkillSearch}
                        disabled={isSearching}
                        startIcon={isSearching ? <CircularProgress size={20} /> : null}
                      >
                        {isSearching ? 'Recherche...' : 'Filtrer'}
                      </Button>
                    </InputAdornment>
                  ),
                }}
              />
            </CardContent>
          </Card>

          {/* Loading State */}
          {isSearching && searchResults.length === 0 && (
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="center" alignItems="center" py={4}>
                  <CircularProgress sx={{ mr: 2 }} />
                  <Typography variant="h6">Chargement des compétences...</Typography>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Search Results */}
          {!isSearching && searchResults.length > 0 && (
            <Box>
              {searchResults.map((result: any) => (
                <Card key={result.skillId} sx={{ mb: 3 }}>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                      <Box>
                        <Typography variant="h6" fontWeight="bold">
                          {result.skillName}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {result.category}
                        </Typography>
                      </Box>
                      <Chip
                        label={`${result.totalCandidates} candidat${result.totalCandidates > 1 ? 's' : ''}`}
                        color="primary"
                        size="large"
                      />
                    </Box>

                    {result.description && (
                      <Typography variant="body2" color="text.secondary" mb={2}>
                        {result.description}
                      </Typography>
                    )}

                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Candidat</TableCell>
                            <TableCell>Contact</TableCell>
                            <TableCell>Ville</TableCell>
                            <TableCell>Niveau</TableCell>
                            <TableCell>Exp. (ans)</TableCell>
                            <TableCell align="right">Confiance</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {result.candidates.map((c: any) => (
                            <TableRow key={c.candidateId} hover>
                              <TableCell>
                                <Box display="flex" alignItems="center" gap={1}>
                                  <Avatar sx={{ width: 32, height: 32 }}>
                                    {c.candidate.firstName[0]}{c.candidate.lastName[0]}
                                  </Avatar>
                                  <Box>
                                    <Typography variant="body2" fontWeight="bold">
                                      {c.candidate.firstName} {c.candidate.lastName}
                                    </Typography>
                                  </Box>
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Typography variant="caption" display="block">
                                  {c.candidate.email}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {c.candidate.phone || 'N/A'}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2">
                                  {c.candidate.city}, {c.candidate.province}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  label={LEVEL_LABELS[c.level] || c.level}
                                  color={LEVEL_COLORS[c.level] || 'default'}
                                  size="small"
                                />
                              </TableCell>
                              <TableCell>
                                {c.yearsExperience || '-'}
                              </TableCell>
                              <TableCell align="right">
                                <Box display="flex" alignItems="center" justifyContent="flex-end" gap={1}>
                                  <Typography variant="caption" fontWeight="bold">
                                    {(c.confidence * 100).toFixed(0)}%
                                  </Typography>
                                  <Box
                                    sx={{
                                      width: 40,
                                      height: 6,
                                      bgcolor: 'grey.200',
                                      borderRadius: 3,
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <Box
                                      sx={{
                                        width: `${c.confidence * 100}%`,
                                        height: '100%',
                                        bgcolor: getConfidenceColor(c.confidence),
                                      }}
                                    />
                                  </Box>
                                </Box>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}

          {searchResults.length === 0 && skillSearchQuery && !isSearching && (
            <Card>
              <CardContent>
                <Box textAlign="center" py={4}>
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    Aucun résultat trouvé
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Essayez avec un autre terme de recherche
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          )}
        </Box>
      )}
    </Box>
  );
};

export default AutresCompetancesPage;
