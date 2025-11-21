import { useState, useEffect, useMemo } from 'react';
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
  AvatarGroup,
  Stack,
  Divider,
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
  useMediaQuery,
  useTheme,
  Checkbox,
  TablePagination,
} from '@mui/material';
import {
  Search as SearchIcon,
  Visibility as VisibilityIcon,
  WorkOutline as WorkIcon,
  Psychology as AiIcon,
  CloudUpload as UploadIcon,
  Category as CategoryIcon,
  BarChart as BarChartIcon,
  PersonOutline as PersonIcon,
  LocationOnOutlined as LocationIcon,
  EmailOutlined as EmailIcon,
  PhoneOutlined as PhoneIcon,
  Settings as SettingsIcon,
  AutoAwesome as AutoAwesomeIcon,
  Close as CloseIcon,
  Download as DownloadIcon,
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

const SKILL_COLORS = ['#6366F1', '#0EA5E9', '#10B981', '#F97316', '#8B5CF6', '#EC4899'];
const AVATAR_COLORS = ['#1D4ED8', '#059669', '#7C3AED', '#B91C1C', '#0369A1', '#D97706'];

const getSkillColor = (name: string): string => {
  if (!name) {
    return SKILL_COLORS[0];
  }
  const firstCode = name.charCodeAt(0);
  const lastCode = name.charCodeAt(Math.max(name.length - 1, 0));
  return SKILL_COLORS[(firstCode + lastCode) % SKILL_COLORS.length];
};

const getAvatarColor = (name?: string): string => {
  if (!name) {
    return AVATAR_COLORS[0];
  }
  const code = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
};

const getCandidateInitials = (candidate?: { firstName?: string; lastName?: string }): string => {
  const initials = `${candidate?.firstName?.[0] || ''}${candidate?.lastName?.[0] || ''}`.trim();
  return initials || '?';
};

const formatPercentage = (value: number): string => `${Math.round(value)}%`;

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
  const [batchLimit, setBatchLimit] = useState<number>(10); // Par dÃ©faut: 10 CVs
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);



  // New states for search tab
  const [mainTab, setMainTab] = useState<'extraction' | 'search'>('extraction');
  const [skillSearchQuery, setSkillSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const theme = useTheme();
  const isCompactView = useMediaQuery(theme.breakpoints.down('md'));

  const aggregatedStats = useMemo(() => {
    const categoryCounts: Record<string, number> = {};
    const levelCounts: Record<string, number> = {};
    const confidenceSummary: Array<{ skill: string; avgConfidence: number; totalCandidates: number; category: string }> = [];

    if (searchResults.length === 0) {
      return {
        categoryCounts,
        levelCounts,
        totalCandidates: 0,
        topConfidenceSkills: confidenceSummary,
      };
    }

    searchResults.forEach((result: any) => {
      const candidates = result.candidates || [];
      const total = result.totalCandidates || candidates.length || 0;
      const category = result.category || 'Autres';
      categoryCounts[category] = (categoryCounts[category] || 0) + total;

      if (candidates.length > 0) {
        const avgConfidence =
          candidates.reduce((sum: number, candidate: any) => sum + (candidate.confidence || 0), 0) / candidates.length;
        confidenceSummary.push({
          skill: result.skillName,
          avgConfidence,
          totalCandidates: total,
          category,
        });
      }

      candidates.forEach((candidate: any) => {
        const level = candidate.level || 'INCONNU';
        levelCounts[level] = (levelCounts[level] || 0) + 1;
      });
    });

    confidenceSummary.sort((a, b) => b.avgConfidence - a.avgConfidence);

    return {
      categoryCounts,
      levelCounts,
      totalCandidates: Object.values(categoryCounts).reduce((acc, value) => acc + value, 0),
      topConfidenceSkills: confidenceSummary.slice(0, 4),
    };
  }, [searchResults]);

  const categoryEntries = Object.entries(aggregatedStats.categoryCounts);
  const levelEntries = Object.entries(aggregatedStats.levelCounts);


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

  const handleToggleSelect = (id: string) => {
    setSelectedCandidateIds(prev =>
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const allIds = prospects.map((p: any) => p.id);
      setSelectedCandidateIds(allIds);
    } else {
      setSelectedCandidateIds([]);
    }
  };


  const handleBatchExtract = () => {
    // Si des candidats sont sélectionnés manuellement, on utilise ceux-là
    if (selectedCandidateIds.length > 0) {
      const selectedProspects = prospects.filter((p: any) => selectedCandidateIds.includes(p.id));
      const prospectsWithCv = selectedProspects.filter((p: any) => p.cvUrl || p.cvStoragePath);

      if (prospectsWithCv.length === 0) {
        enqueueSnackbar('Aucun des candidats sélectionnés n\'a de CV disponible', { variant: 'warning' });
        return;
      }

      const count = prospectsWithCv.length;
      const estimatedCost = (count * 0.10).toFixed(2);
      const estimatedTime = Math.ceil(count * 2 / 60);

      const confirmed = window.confirm(
        `⚠️ EXTRACTION MANUELLE\n\n` +
        `Vous avez sélectionné ${count} candidat(s) avec CV.\n` +
        `Coût estimé: ~$${estimatedCost} USD\n` +
        `Temps estimé: ~${estimatedTime} minutes\n\n` +
        `Voulez-vous lancer l'extraction pour ces candidats spécifiques?`
      );

      if (confirmed) {
        batchExtractMutation.mutate(prospectsWithCv.map((p: any) => p.id));
        setSelectedCandidateIds([]); // Reset selection after launch
      }
      return;
    }

    // Sinon, comportement par défaut (batch automatique)
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
    const estimatedCost = (count * 0.10).toFixed(2);
    const estimatedTime = Math.ceil(count * 2 / 60); // ~2 sec per extraction

    const confirmed = window.confirm(
      `⚠️ ATTENTION - Extraction en masse (Automatique)\n\n` +
      `Candidats à traiter: ${count}${batchLimit > 0 && prospectsWithCv.length > batchLimit ? ` sur ${prospectsWithCv.length}` : ''}\n` +
      `Coût estimé: ~$${estimatedCost} USD\n` +
      `Temps estimé: ~${estimatedTime} minutes\n\n` +
      `⚠️ Les candidats déjà traités seront ignorés.\n\n` +
      `Voulez-vous continuer?`
    );

    if (confirmed) {
      batchExtractMutation.mutate(limitedProspects.map((p: any) => p.id));
    }
  };


  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'success.main';
    if (confidence >= 0.5) return 'warning.main';
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
        undefined,
        0.3,
        accessToken!
      );
      setSearchResults(results.results || []);
    } catch (error: any) {
      enqueueSnackbar('Erreur lors de la recherche', { variant: 'error' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Paginate prospects
  const paginatedProspects = filteredProspects.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );


  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            Autre Compétence
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Candidats avec des compétences hors du secteur de la sécurité
          </Typography>
        </Box>
        <Box>

          <Button
            variant="contained"
            startIcon={<AutoAwesomeIcon />}
            onClick={handleBatchExtract}
            disabled={batchExtractMutation.isPending}
          >
            {batchExtractMutation.isPending ? 'Extraction...' : selectedCandidateIds.length > 0 ? `Extraire (${selectedCandidateIds.length})` : 'Extraire les compétences'}
          </Button>

        </Box>
      </Box>

      <Tabs
        value={mainTab}
        onChange={(_, v) => setMainTab(v)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="📄 Extraction de CVs" value="extraction" />
        <Tab label="🔍 Recherche de Compétences" value="search" />
      </Tabs>

      {mainTab === 'extraction' && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                {prospects.length === 0 ? (
                  <Box textAlign="center" py={4}>
                    <Typography variant="body1" color="text.secondary">
                      Aucun candidat potentiel trouvé.
                    </Typography>
                  </Box>
                ) : (
                  <>
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell padding="checkbox">
                              <Checkbox
                                indeterminate={selectedCandidateIds.length > 0 && selectedCandidateIds.length < prospects.length}
                                checked={prospects.length > 0 && selectedCandidateIds.length === prospects.length}
                                onChange={handleSelectAll}
                              />
                            </TableCell>
                            <TableCell>Candidat Potentiel</TableCell>
                            <TableCell>Ville</TableCell>
                            <TableCell>CV</TableCell>
                            <TableCell>Date de soumission</TableCell>
                            <TableCell>Contacté</TableCell>
                            <TableCell align="right">Actions</TableCell>
                          </TableRow>

                        </TableHead>
                        <TableBody>
                          {paginatedProspects.map((prospect: any) => (
                            <TableRow key={prospect.id} hover selected={selectedCandidateIds.includes(prospect.id)}>

                              <TableCell padding="checkbox">
                                <Checkbox
                                  checked={selectedCandidateIds.includes(prospect.id)}
                                  onChange={() => handleToggleSelect(prospect.id)}
                                />
                              </TableCell>
                              <TableCell>

                                <Box display="flex" alignItems="center" gap={2}>
                                  <Avatar>
                                    {prospect.firstName?.[0]}
                                    {prospect.lastName?.[0]}
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
                                {prospect.city || '-'}
                              </TableCell>
                              <TableCell>
                                {prospect.cvUrl || prospect.cvStoragePath ? (
                                  <Chip label="CV Disponible" color="success" size="small" icon={<UploadIcon />} />
                                ) : (
                                  <Chip label="Pas de CV" color="default" size="small" />
                                )}
                              </TableCell>
                              <TableCell>
                                {new Date(prospect.createdAt).toLocaleDateString()}
                              </TableCell>
                              <TableCell>
                                {prospect.contacted ? (
                                  <Chip label="Oui" color="success" size="small" />
                                ) : (
                                  <Chip label="Non" color="warning" size="small" />
                                )}
                              </TableCell>
                              <TableCell align="right">
                                <Box display="flex" justifyContent="flex-end" gap={1}>
                                  <Tooltip title="Voir le profil">
                                    <IconButton size="small" onClick={() => navigate(`/prospects/${prospect.id}`)}>
                                      <VisibilityIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Extraire les compétences">
                                    <IconButton
                                      size="small"
                                      color="primary"
                                      onClick={() => handleExtractSkills(prospect.id, `${prospect.firstName} ${prospect.lastName}`, !!(prospect.cvUrl || prospect.cvStoragePath))}
                                      disabled={!prospect.cvUrl && !prospect.cvStoragePath}
                                    >
                                      <AutoAwesomeIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    <TablePagination
                      rowsPerPageOptions={[5, 10, 25, 50, 100]}
                      component="div"
                      count={filteredProspects.length}
                      rowsPerPage={rowsPerPage}
                      page={page}
                      onPageChange={handleChangePage}
                      onRowsPerPageChange={handleChangeRowsPerPage}
                      labelRowsPerPage="Lignes par page:"
                      labelDisplayedRows={({ from, to, count }) => `${from}-${to} sur ${count}`}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Dialog
        open={showResultsDialog}
        onClose={() => setShowResultsDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Résultats de l'extraction</Typography>
            <Box>
              <IconButton
                onClick={() => setShowResultsDialog(false)}
                color="default"
                size="small"
              >
                <CloseIcon />
              </IconButton>
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
              label={`Autre Compétence (${otherSkills.length})`}
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
                ? "Aucune compÃ©tence non liÃ©e Ã  la sÃ©curitÃ© n'a Ã©tÃ© trouvÃ©e dans ce CV."
                : "Aucune compÃ©tence liÃ©e Ã  la sÃ©curitÃ© n'a Ã©tÃ© trouvÃ©e dans ce CV."}
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
            {saveMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder les CompÃ©tences'}
          </Button>
        </DialogActions>
      </Dialog >

      {/* Batch Extraction Results Dialog */}
      < Dialog
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
            <Box sx={{ mt: 2 }}>
              {/* Summary Cards */}
              <Grid container spacing={2} sx={{ mb: 4 }}>
                <Grid item xs={6} md={3}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      textAlign: 'center',
                      bgcolor: 'primary.50',
                      border: 1,
                      borderColor: 'primary.200',
                      borderRadius: 2,
                    }}
                  >
                    <Typography variant="h4" fontWeight="bold" color="primary.main">
                      {batchResults.summary.total}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" fontWeight="medium">
                      TOTAL CANDIDATS
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      textAlign: 'center',
                      bgcolor: 'success.50',
                      border: 1,
                      borderColor: 'success.200',
                      borderRadius: 2,
                    }}
                  >
                    <Typography variant="h4" fontWeight="bold" color="success.main">
                      {batchResults.summary.processed || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" fontWeight="medium">
                      SUCCÈS
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      textAlign: 'center',
                      bgcolor: 'warning.50',
                      border: 1,
                      borderColor: 'warning.200',
                      borderRadius: 2,
                    }}
                  >
                    <Typography variant="h4" fontWeight="bold" color="warning.main">
                      {batchResults.summary.skipped || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" fontWeight="medium">
                      DÉJÀ TRAITÉS
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      textAlign: 'center',
                      bgcolor: 'error.50',
                      border: 1,
                      borderColor: 'error.200',
                      borderRadius: 2,
                    }}
                  >
                    <Typography variant="h4" fontWeight="bold" color="error.main">
                      {batchResults.summary.failed}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" fontWeight="medium">
                      ÉCHECS
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>

              {/* Total Skills Extracted Banner */}
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  mb: 4,
                  background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                  color: 'white',
                  borderRadius: 3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Box>
                  <Typography variant="h3" fontWeight="bold">
                    {batchResults.summary.totalSkillsExtracted}
                  </Typography>
                  <Typography variant="subtitle1" sx={{ opacity: 0.9 }}>
                    Nouvelles compétences identifiées
                  </Typography>
                </Box>
                <AutoAwesomeIcon sx={{ fontSize: 64, opacity: 0.2 }} />
              </Paper>

              {/* Detailed Results Table */}
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CategoryIcon fontSize="small" color="action" />
                Détails par candidat
              </Typography>

              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400, borderRadius: 2 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ bgcolor: 'grey.50', fontWeight: 'bold' }}>Candidat</TableCell>
                      <TableCell sx={{ bgcolor: 'grey.50', fontWeight: 'bold' }}>Statut</TableCell>
                      <TableCell align="right" sx={{ bgcolor: 'grey.50', fontWeight: 'bold' }}>Compétences</TableCell>
                      <TableCell sx={{ bgcolor: 'grey.50', fontWeight: 'bold' }}>Message / Erreur</TableCell>
                      <TableCell align="right" sx={{ bgcolor: 'grey.50', fontWeight: 'bold' }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {batchResults.results.map((result: any, index: number) => (
                      <TableRow key={index} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight="bold">
                            {result.name || 'Inconnu'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                            {result.candidateId.substring(0, 8)}...
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {result.success ? (
                            result.skipped ? (
                              <Chip label="Ignoré" color="warning" size="small" variant="outlined" />
                            ) : (
                              <Chip label="Succès" color="success" size="small" variant="filled" />
                            )
                          ) : (
                            <Chip label="Échec" color="error" size="small" variant="filled" />
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {(result.skillsCount || result.skillsFound) > 0 ? (
                            <Typography fontWeight="bold" color="primary.main">
                              {result.skillsCount || result.skillsFound}
                            </Typography>
                          ) : (
                            <Typography color="text.secondary">-</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {result.error ? (
                            <Typography variant="caption" color="error" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <CloseIcon fontSize="inherit" /> {result.error}
                            </Typography>
                          ) : result.skipped ? (
                            <Typography variant="caption" color="text.secondary">
                              Déjà traité précédemment
                            </Typography>
                          ) : (
                            <Typography variant="caption" color="success.main">
                              Extraction réussie
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {result.success && !result.skipped && result.skills && (
                            <Tooltip title="Voir les compétences">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => {
                                  setExtractedSkills(result.skills);
                                  setCurrentCandidateName(result.name);
                                  setExtractingCandidateId(result.candidateId);
                                  setShowResultsDialog(true);
                                }}
                              >
                                <VisibilityIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBatchDialog(false)} variant="contained">
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Search Tab */}
      {
        mainTab === 'search' && (
          <Box>
            <Box display="flex" justifyContent="flex-end" mb={2}>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={() => {
                  const params = new URLSearchParams();
                  if (skillSearchQuery) {
                    params.set('q', skillSearchQuery);
                  }
                  navigate(`/exports?${params.toString()}`);
                }}
              >
                Exporter ces résultats
              </Button>
            </Box>

            {/* Summary Card */}
            {searchResults.length > 0 && (
              <Card
                sx={{
                  mb: 3,
                  background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
                  color: 'white',
                  borderRadius: 3,
                }}
              >
                <CardContent>
                  <Grid container spacing={3}>
                    <Grid item xs={12} sm={4}>
                      <Stack alignItems="center" spacing={1.5}>
                        <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.12)', color: 'white', width: 56, height: 56 }}>
                          <SearchIcon />
                        </Avatar>
                        <Typography variant="h3" fontWeight="bold">
                          {searchResults.length}
                        </Typography>
                        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                          Compétences extraites
                        </Typography>
                      </Stack>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Stack alignItems="center" spacing={1.5}>
                        <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.12)', color: 'white', width: 56, height: 56 }}>
                          <PersonIcon />
                        </Avatar>
                        <Typography variant="h3" fontWeight="bold">
                          {aggregatedStats.totalCandidates}
                        </Typography>
                        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                          Candidats totaux
                        </Typography>
                      </Stack>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Stack alignItems="center" spacing={1.5}>
                        <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.12)', color: 'white', width: 56, height: 56 }}>
                          <CategoryIcon />
                        </Avatar>
                        <Typography variant="h3" fontWeight="bold">
                          {categoryEntries.length}
                        </Typography>
                        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                          Catégories représentées
                        </Typography>
                      </Stack>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            )}

            {searchResults.length > 0 && (
              <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                        <Typography variant="h6" fontWeight="bold">
                          Répartition par catégorie
                        </Typography>
                        <CategoryIcon color="primary" />
                      </Box>
                      {categoryEntries.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          Aucune donnée pour l'instant
                        </Typography>
                      ) : (
                        <Stack spacing={1.5}>
                          {categoryEntries.map(([category, count]) => {
                            const percentage = aggregatedStats.totalCandidates
                              ? Math.round((count / aggregatedStats.totalCandidates) * 100)
                              : 0;
                            return (
                              <Box key={category}>
                                <Box display="flex" justifyContent="space-between" alignItems="center">
                                  <Typography variant="body2" fontWeight="bold">
                                    {category}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {count} ({percentage}%)
                                  </Typography>
                                </Box>
                                <LinearProgress
                                  variant="determinate"
                                  value={percentage}
                                  sx={{ height: 8, borderRadius: 4, mt: 0.5 }}
                                />
                              </Box>
                            );
                          })}
                        </Stack>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                        <Typography variant="h6" fontWeight="bold">
                          Niveaux d'expérience
                        </Typography>
                        <BarChartIcon color="primary" />
                      </Box>
                      {levelEntries.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          Les niveaux apparaîtront après une première recherche
                        </Typography>
                      ) : (
                        <Stack spacing={1.5}>
                          {levelEntries.map(([level, count]) => {
                            const label = LEVEL_LABELS[level as keyof typeof LEVEL_LABELS] || level;
                            const percentage = aggregatedStats.totalCandidates
                              ? Math.round((count / aggregatedStats.totalCandidates) * 100)
                              : 0;
                            return (
                              <Box key={level}>
                                <Box display="flex" justifyContent="space-between" alignItems="center">
                                  <Typography variant="body2" fontWeight="bold">
                                    {label}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {count} ({percentage}%)
                                  </Typography>
                                </Box>
                                <LinearProgress
                                  variant="determinate"
                                  value={percentage}
                                  sx={{ height: 8, borderRadius: 4, mt: 0.5 }}
                                />
                              </Box>
                            );
                          })}
                        </Stack>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
                {aggregatedStats.topConfidenceSkills.length > 0 && (
                  <Grid item xs={12}>
                    <Card>
                      <CardContent>
                        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                          <Typography variant="h6" fontWeight="bold">
                            Compétences les plus fiables
                          </Typography>
                          <BarChartIcon color="primary" />
                        </Box>
                        <Stack spacing={1.5}>
                          {aggregatedStats.topConfidenceSkills.map((skill) => {
                            const percentage = Math.round(skill.avgConfidence * 100);
                            return (
                              <Paper
                                key={skill.skill}
                                variant="outlined"
                                sx={{ p: 2, borderRadius: 2, display: 'flex', flexWrap: 'wrap', gap: 2 }}
                              >
                                <Box flex={1} minWidth={200}>
                                  <Typography variant="subtitle1" fontWeight="bold">
                                    {skill.skill}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {skill.category}
                                  </Typography>
                                </Box>
                                <Chip
                                  label={`${skill.totalCandidates} candidat${skill.totalCandidates > 1 ? 's' : ''}`}
                                  color="primary"
                                  variant="outlined"
                                />
                                <Box flexBasis="100%" />
                                <Box display="flex" alignItems="center" gap={2} width="100%">
                                  <Typography variant="h5" fontWeight="bold">
                                    {formatPercentage(percentage)}
                                  </Typography>
                                  <LinearProgress
                                    variant="determinate"
                                    value={percentage}
                                    sx={{
                                      flex: 1,
                                      height: 8,
                                      borderRadius: 4,
                                      '& .MuiLinearProgress-bar': {
                                        bgcolor: getConfidenceColor(skill.avgConfidence),
                                      },
                                    }}
                                  />
                                </Box>
                              </Paper>
                            );
                          })}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                )}
              </Grid>
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
            {
              isSearching && searchResults.length === 0 && (
                <Card>
                  <CardContent>
                    <Box display="flex" justifyContent="center" alignItems="center" py={4}>
                      <CircularProgress sx={{ mr: 2 }} />
                      <Typography variant="h6">Chargement des compétences...</Typography>
                    </Box>
                  </CardContent>
                </Card>
              )
            }

            {/* Search Results */}
            {
              !isSearching && searchResults.length > 0 && (
                <Grid container spacing={3}>
                  {searchResults.map((result: any) => {
                    const candidates = result.candidates || [];
                    const totalCandidatesForSkill = result.totalCandidates || candidates.length || 0;
                    const averageConfidence =
                      candidates.length > 0
                        ? candidates.reduce((sum: number, c: any) => sum + (c.confidence || 0), 0) / candidates.length
                        : 0;
                    const averageExperience =
                      candidates.length > 0
                        ? (
                          candidates.reduce((sum: number, c: any) => sum + (c.yearsExperience || 0), 0) / candidates.length
                        ).toFixed(1)
                        : '-';
                    const displayedCandidates = candidates.slice(0, 4);
                    const uniqueCities = [
                      ...new Set(
                        candidates
                          .map((c: any) => [c.candidate?.city, c.candidate?.province].filter(Boolean).join(', '))
                          .filter(Boolean)
                      ),
                    ];
                    const skillColor = getSkillColor(result.skillName);
                    const skillInitials = (result.skillName || '?').slice(0, 2).toUpperCase();

                    return (
                      <Grid item xs={12} md={6} key={result.skillId || result.skillName}>
                        <Card
                          sx={{
                            height: '100%',
                            borderRadius: 3,
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 20px 45px rgba(15, 23, 42, 0.1)',
                          }}
                        >
                          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 2,
                                p: 2,
                                borderRadius: 2,
                                bgcolor: `${skillColor}15`,
                              }}
                            >
                              <Avatar
                                sx={{
                                  bgcolor: skillColor,
                                  color: 'white',
                                  width: 56,
                                  height: 56,
                                  fontSize: 18,
                                  fontWeight: 'bold',
                                }}
                              >
                                {skillInitials}
                              </Avatar>
                              <Box flexGrow={1}>
                                <Typography variant="h6" fontWeight="bold">
                                  {result.skillName}
                                </Typography>
                                <Chip
                                  label={result.category || 'Autre'}
                                  icon={<CategoryIcon fontSize="small" />}
                                  variant="outlined"
                                  size="small"
                                  sx={{ mt: 0.5 }}
                                />
                              </Box>
                              <Chip
                                label={`${totalCandidatesForSkill} candidat${totalCandidatesForSkill > 1 ? 's' : ''}`}
                                color="primary"
                                variant="outlined"
                              />
                            </Box>

                            {result.description && (
                              <Typography variant="body2" color="text.secondary">
                                {result.description}
                              </Typography>
                            )}

                            <Grid container spacing={2}>
                              <Grid item xs={6}>
                                <Typography variant="body2" color="text.secondary">
                                  Confiance moyenne
                                </Typography>
                                <Typography variant="h5" fontWeight="bold">
                                  {formatPercentage(averageConfidence * 100)}
                                </Typography>
                                <LinearProgress
                                  variant="determinate"
                                  value={Math.round(averageConfidence * 100)}
                                  sx={{
                                    height: 8,
                                    borderRadius: 4,
                                    '& .MuiLinearProgress-bar': {
                                      bgcolor: getConfidenceColor(averageConfidence),
                                    },
                                  }}
                                />
                              </Grid>
                              <Grid item xs={6}>
                                <Typography variant="body2" color="text.secondary">
                                  Expérience moyenne
                                </Typography>
                                <Typography variant="h5" fontWeight="bold">
                                  {averageExperience === '-' ? '-' : `${averageExperience} ans`}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {uniqueCities.length || 0} ville{uniqueCities.length > 1 ? 's' : ''}
                                </Typography>
                              </Grid>
                            </Grid>

                            {candidates.length > 0 && (
                              <Box>
                                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                  <Typography variant="subtitle2" color="text.secondary">
                                    Candidats correspondants
                                  </Typography>
                                  <AvatarGroup max={4}>
                                    {displayedCandidates.map((candidateItem: any) => {
                                      const name = `${candidateItem.candidate?.firstName || ''} ${candidateItem.candidate?.lastName || ''}`.trim();
                                      const initials = getCandidateInitials(candidateItem.candidate);
                                      return (
                                        <Tooltip
                                          key={candidateItem.candidateId}
                                          title={name || 'Candidat'}
                                          arrow
                                        >
                                          <Avatar sx={{ bgcolor: getAvatarColor(name), width: 36, height: 36 }}>
                                            {initials !== '?' ? initials : <PersonIcon fontSize="small" />}
                                          </Avatar>
                                        </Tooltip>
                                      );
                                    })}
                                  </AvatarGroup>
                                </Box>
                              </Box>
                            )}

                            <Divider />

                            {candidates.length === 0 ? (
                              <Typography variant="body2" color="text.secondary">
                                Aucun candidat ne correspond à cette compétence pour le moment.
                              </Typography>
                            ) : isCompactView ? (
                              <Stack spacing={2}>
                                {candidates.map((c: any) => {
                                  const candidateName = `${c.candidate?.firstName || ''} ${c.candidate?.lastName || ''}`.trim();
                                  const candidateLocation = [c.candidate?.city, c.candidate?.province]
                                    .filter(Boolean)
                                    .join(', ');
                                  return (
                                    <Paper key={c.candidateId} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                                      <Stack spacing={1.5}>
                                        <Box display="flex" alignItems="center" gap={1.5}>
                                          <Avatar sx={{ bgcolor: getAvatarColor(candidateName) }}>
                                            {getCandidateInitials(c.candidate)}
                                          </Avatar>
                                          <Box>
                                            <Typography variant="subtitle2" fontWeight="bold">
                                              {candidateName || 'Candidat inconnu'}
                                            </Typography>
                                            <Chip
                                              size="small"
                                              label={LEVEL_LABELS[c.level] || c.level}
                                              color={LEVEL_COLORS[c.level] || 'default'}
                                              sx={{ mt: 0.5 }}
                                            />
                                          </Box>
                                        </Box>
                                        <Stack spacing={0.5}>
                                          {candidateLocation && (
                                            <Stack direction="row" spacing={1} alignItems="center">
                                              <LocationIcon fontSize="small" color="action" />
                                              <Typography variant="body2">{candidateLocation}</Typography>
                                            </Stack>
                                          )}
                                          {c.candidate?.email && (
                                            <Stack direction="row" spacing={1} alignItems="center">
                                              <EmailIcon fontSize="small" color="action" />
                                              <Typography variant="body2">{c.candidate.email}</Typography>
                                            </Stack>
                                          )}
                                          <Stack direction="row" spacing={1} alignItems="center">
                                            <PhoneIcon fontSize="small" color="action" />
                                            <Typography variant="body2">{c.candidate?.phone || 'N/A'}</Typography>
                                          </Stack>
                                        </Stack>
                                        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                                          <Typography variant="body2">
                                            Exp: {c.yearsExperience || '-'} an{(c.yearsExperience || 0) > 1 ? 's' : ''}
                                          </Typography>
                                          <Box display="flex" alignItems="center" gap={1}>
                                            <Typography variant="caption" fontWeight="bold">
                                              {formatPercentage((c.confidence || 0) * 100)}
                                            </Typography>
                                            <Box sx={{ width: 80 }}>
                                              <LinearProgress
                                                variant="determinate"
                                                value={Math.round((c.confidence || 0) * 100)}
                                                sx={{
                                                  height: 6,
                                                  borderRadius: 3,
                                                  '& .MuiLinearProgress-bar': {
                                                    bgcolor: getConfidenceColor(c.confidence || 0),
                                                  },
                                                }}
                                              />
                                            </Box>
                                          </Box>
                                        </Stack>
                                      </Stack>
                                    </Paper>
                                  );
                                })}
                              </Stack>
                            ) : (
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
                                    {candidates.map((c: any) => {
                                      const candidateName = `${c.candidate?.firstName || ''} ${c.candidate?.lastName || ''}`.trim();
                                      const candidateLocation = [c.candidate?.city, c.candidate?.province]
                                        .filter(Boolean)
                                        .join(', ');
                                      return (
                                        <TableRow key={c.candidateId} hover>
                                          <TableCell>
                                            <Box display="flex" alignItems="center" gap={1}>
                                              <Avatar sx={{ width: 40, height: 40, bgcolor: getAvatarColor(candidateName) }}>
                                                {getCandidateInitials(c.candidate)}
                                              </Avatar>
                                              <Box>
                                                <Typography variant="body2" fontWeight="bold">
                                                  {candidateName || 'Candidat'}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                  {c.candidate?.title || 'Profil'}
                                                </Typography>
                                              </Box>
                                            </Box>
                                          </TableCell>
                                          <TableCell>
                                            <Stack spacing={0.5}>
                                              {c.candidate?.email && (
                                                <Stack direction="row" spacing={0.5} alignItems="center">
                                                  <EmailIcon fontSize="inherit" color="action" />
                                                  <Typography variant="caption">{c.candidate.email}</Typography>
                                                </Stack>
                                              )}
                                              <Stack direction="row" spacing={0.5} alignItems="center">
                                                <PhoneIcon fontSize="inherit" color="action" />
                                                <Typography variant="caption">{c.candidate?.phone || 'N/A'}</Typography>
                                              </Stack>
                                            </Stack>
                                          </TableCell>
                                          <TableCell>
                                            <Typography variant="body2">{candidateLocation || 'N/A'}</Typography>
                                          </TableCell>
                                          <TableCell>
                                            <Chip
                                              label={LEVEL_LABELS[c.level] || c.level}
                                              color={LEVEL_COLORS[c.level] || 'default'}
                                              size="small"
                                            />
                                          </TableCell>
                                          <TableCell>{c.yearsExperience || '-'}</TableCell>
                                          <TableCell align="right">
                                            <Box display="flex" alignItems="center" justifyContent="flex-end" gap={1}>
                                              <Typography variant="caption" fontWeight="bold">
                                                {formatPercentage((c.confidence || 0) * 100)}
                                              </Typography>
                                              <Box sx={{ width: 60 }}>
                                                <LinearProgress
                                                  variant="determinate"
                                                  value={Math.round((c.confidence || 0) * 100)}
                                                  sx={{
                                                    height: 6,
                                                    borderRadius: 3,
                                                    '& .MuiLinearProgress-bar': {
                                                      bgcolor: getConfidenceColor(c.confidence || 0),
                                                    },
                                                  }}
                                                />
                                              </Box>
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
                      </Grid>
                    );
                  })}
                </Grid>
              )
            }

            {
              searchResults.length === 0 && skillSearchQuery && !isSearching && (
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
              )
            }
          </Box>
        )
      }
    </Box >
  );
};

export default AutresCompetancesPage;



