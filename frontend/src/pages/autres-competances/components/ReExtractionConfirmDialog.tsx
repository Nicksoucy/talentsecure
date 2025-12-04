import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Typography,
    RadioGroup,
    FormControlLabel,
    Radio,
    Alert,
    Stack,
    Chip,
} from '@mui/material';
import {
    Warning as WarningIcon,
    Merge as MergeIcon,
    Autorenew as ReplaceIcon,
} from '@mui/icons-material';
import { useState } from 'react';

interface ReExtractionConfirmDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: (mode: 'merge' | 'replace') => void;
    prospectName: string;
    existingSkillsCount: number;
    estimatedCost?: number;
}

const ReExtractionConfirmDialog = ({
    open,
    onClose,
    onConfirm,
    prospectName,
    existingSkillsCount,
    estimatedCost = 0.05,
}: ReExtractionConfirmDialogProps) => {
    const [mode, setMode] = useState<'merge' | 'replace'>('merge');

    const handleConfirm = () => {
        onConfirm(mode);
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                <Box display="flex" alignItems="center" gap={2}>
                    <WarningIcon color="warning" fontSize="large" />
                    <Box>
                        <Typography variant="h6">Ré-extraction de Compétences</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {prospectName}
                        </Typography>
                    </Box>
                </Box>
            </DialogTitle>

            <DialogContent>
                <Stack spacing={3}>
                    {/* Warning Alert */}
                    <Alert severity="warning" variant="outlined">
                        <Typography variant="body2" fontWeight="bold" gutterBottom>
                            Ce prospect a déjà {existingSkillsCount} compétence{existingSkillsCount > 1 ? 's' : ''} extraite{existingSkillsCount > 1 ? 's' : ''}
                        </Typography>
                        <Typography variant="caption">
                            Une nouvelle extraction peut être coûteuse et modifier les données existantes.
                        </Typography>
                    </Alert>

                    {/* Mode Selection */}
                    <Box>
                        <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                            Que voulez-vous faire ?
                        </Typography>
                        <RadioGroup
                            value={mode}
                            onChange={(e) => setMode(e.target.value as 'merge' | 'replace')}
                        >
                            <FormControlLabel
                                value="merge"
                                control={<Radio />}
                                label={
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <MergeIcon fontSize="small" color="primary" />
                                        <Box>
                                            <Typography variant="body2" fontWeight="bold">
                                                Fusionner (Recommandé)
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                Ajouter les nouvelles compétences sans supprimer les anciennes
                                            </Typography>
                                        </Box>
                                    </Box>
                                }
                            />
                            <FormControlLabel
                                value="replace"
                                control={<Radio />}
                                label={
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <ReplaceIcon fontSize="small" color="error" />
                                        <Box>
                                            <Typography variant="body2" fontWeight="bold">
                                                Remplacer
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                Supprime toutes les compétences existantes et extraire de nouveau
                                            </Typography>
                                        </Box>
                                    </Box>
                                }
                            />
                        </RadioGroup>
                    </Box>

                    {/* Cost Estimation */}
                    <Box
                        p={2}
                        bgcolor="grey.50"
                        borderRadius={2}
                        border={1}
                        borderColor="grey.200"
                    >
                        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                            <Typography variant="body2" color="text.secondary">
                                Coût estimé
                            </Typography>
                            <Chip
                                label={`$${estimatedCost.toFixed(4)}`}
                                color="primary"
                                size="small"
                                variant="outlined"
                            />
                        </Stack>
                        <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                            Utilise l'API OpenAI (gpt-3.5-turbo)
                        </Typography>
                    </Box>
                </Stack>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} color="inherit">
                    Annuler
                </Button>
                <Button
                    onClick={handleConfirm}
                    variant="contained"
                    color={mode === 'replace' ? 'error' : 'primary'}
                    startIcon={mode === 'merge' ? <MergeIcon /> : <ReplaceIcon />}
                >
                    Continuer ({mode === 'merge' ? 'Fusionner' : 'Remplacer'})
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ReExtractionConfirmDialog;
