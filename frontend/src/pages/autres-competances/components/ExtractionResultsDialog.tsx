import React, { useState } from 'react';
import {
    Box,
    Typography,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    IconButton,
    Alert,
    Tabs,
    Tab,
    List,
    ListItem,
    Chip,
    LinearProgress,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { ExtractedSkill } from '@/services/skills.service';

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

const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'success.main';
    if (confidence >= 0.5) return 'warning.main';
    return 'error.main';
};

interface ExtractionResultsDialogProps {
    open: boolean;
    onClose: () => void;
    extractedSkills: ExtractedSkill[];
    onSave: () => void;
    isSaving: boolean;
}

const ExtractionResultsDialog: React.FC<ExtractionResultsDialogProps> = ({
    open,
    onClose,
    extractedSkills,
    onSave,
    isSaving,
}) => {
    const [activeTab, setActiveTab] = useState<'security' | 'other'>('other');

    const securitySkills = extractedSkills.filter((skill) => skill.isSecurityRelated !== false);
    const otherSkills = extractedSkills.filter((skill) => skill.isSecurityRelated === false);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6">Résultats de l'extraction</Typography>
                    <Box>
                        <IconButton onClick={onClose} color="default" size="small">
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
                    <Tab label={`Autre Compétence (${otherSkills.length})`} value="other" />
                    <Tab label={`Compétences Sécurité (${securitySkills.length})`} value="security" />
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
                <Button onClick={onClose}>Fermer</Button>
                <Button
                    variant="contained"
                    color="primary"
                    disabled={extractedSkills.length === 0 || isSaving}
                    onClick={onSave}
                >
                    {isSaving ? 'Sauvegarde...' : 'Sauvegarder les Compétences'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ExtractionResultsDialog;
