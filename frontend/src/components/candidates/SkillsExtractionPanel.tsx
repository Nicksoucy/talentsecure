import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Chip,
  LinearProgress,
  Alert,
  Grid,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Divider,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Psychology as AiIcon,
  Check as CheckIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useMutation } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { skillsService, ExtractedSkill } from '@/services/skills.service';
import { useAuthStore } from '@/store/authStore';

interface SkillsExtractionPanelProps {
  candidateId: string;
  candidateName: string;
  hasCv: boolean;
  onSkillsUpdated?: () => void;
}

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

export default function SkillsExtractionPanel({
  candidateId,
  candidateName,
  hasCv,
  onSkillsUpdated,
}: SkillsExtractionPanelProps) {
  const { accessToken } = useAuthStore();
  const { enqueueSnackbar } = useSnackbar();
  const [extractedSkills, setExtractedSkills] = useState<ExtractedSkill[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [activeTab, setActiveTab] = useState<'security' | 'other'>('security');
  const [extractionStats, setExtractionStats] = useState<{
    processingTime: number;
    totalCost: number;
    tokensUsed: number;
  } | null>(null);

  // Separate skills into security-related and other
  const securitySkills = extractedSkills.filter(skill => skill.isSecurityRelated !== false);
  const otherSkills = extractedSkills.filter(skill => skill.isSecurityRelated === false);

  // Extract skills mutation
  const extractMutation = useMutation({
    mutationFn: () => skillsService.extractSkills(candidateId, 'gpt-3.5-turbo', accessToken!),
    onSuccess: (data) => {
      if (data.success) {
        setExtractedSkills(data.skillsFound);
        setExtractionStats({
          processingTime: data.processingTimeMs,
          totalCost: data.totalCost,
          tokensUsed: data.promptTokens + data.completionTokens,
        });
        setShowResults(true);
        enqueueSnackbar(
          `${data.totalSkills} compétence${data.totalSkills > 1 ? 's' : ''} extraite${data.totalSkills > 1 ? 's' : ''} avec succès!`,
          { variant: 'success' }
        );
      } else {
        enqueueSnackbar(data.errorMessage || 'Erreur lors de l\'extraction', {
          variant: 'error',
        });
      }
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error || 'Erreur lors de l\'extraction des compétences',
        { variant: 'error' }
      );
    },
  });

  // Save skills mutation
  const saveMutation = useMutation({
    mutationFn: () => {
      const skills = extractedSkills.map(skill => ({
        name: skill.skillName,
        level: skill.level,
        yearsExperience: skill.yearsExperience,
      }));
      return skillsService.saveSkills(candidateId, skills, accessToken!);
    },
    onSuccess: () => {
      enqueueSnackbar('Compétences sauvegardées avec succès!', { variant: 'success' });
      setShowResults(false);
      onSkillsUpdated?.();
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error || 'Erreur lors de la sauvegarde des compétences',
        { variant: 'error' }
      );
    },
  });

  const handleExtract = () => {
    if (!hasCv) {
      enqueueSnackbar('Ce candidat n\'a pas de CV uploadé', { variant: 'warning' });
      return;
    }
    extractMutation.mutate();
  };

  const handleCloseResults = () => {
    setShowResults(false);
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'success.main';
    if (confidence >= 0.6) return 'warning.main';
    return 'error.main';
  };

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" fontWeight="bold">
            Extraction de Compétences par IA
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AiIcon />}
            onClick={handleExtract}
            disabled={extractMutation.isPending || !hasCv}
          >
            {extractMutation.isPending ? 'Extraction en cours...' : 'Extraire avec AI'}
          </Button>
        </Box>

        {!hasCv && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Veuillez uploader un CV pour ce candidat afin d'extraire les compétences automatiquement.
          </Alert>
        )}

        {extractMutation.isPending && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress />
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
              Analyse du CV avec OpenAI GPT-3.5-Turbo...
            </Typography>
          </Box>
        )}

        {/* Results Dialog */}
        <Dialog
          open={showResults}
          onClose={handleCloseResults}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">
                Compétences Extraites - {candidateName}
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
            {extractionStats && (
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  <strong>Statistiques:</strong> Traitement en {(extractionStats.processingTime / 1000).toFixed(1)}s
                  • {extractionStats.tokensUsed} tokens
                  • Coût: ${extractionStats.totalCost.toFixed(4)}
                </Typography>
              </Alert>
            )}

            <Tabs
              value={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
              sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
            >
              <Tab
                label={`Compétences Sécurité (${securitySkills.length})`}
                value="security"
              />
              <Tab
                label={`Autre Compétance (${otherSkills.length})`}
                value="other"
              />
            </Tabs>

            <List>
              {(activeTab === 'security' ? securitySkills : otherSkills).map((skill, index) => (
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

            {(activeTab === 'security' ? securitySkills : otherSkills).length === 0 && (
              <Alert severity="info">
                {activeTab === 'security'
                  ? "Aucune compétence liée à la sécurité n'a été trouvée dans ce CV."
                  : "Aucune autre compétence n'a été trouvée dans ce CV."}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseResults}>Fermer</Button>
            <Button
              variant="contained"
              color="primary"
              disabled={extractedSkills.length === 0 || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              startIcon={saveMutation.isPending ? <CircularProgress size={20} /> : undefined}
            >
              {saveMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder les Compétences'}
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}
