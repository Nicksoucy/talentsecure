import { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Typography,
    Alert,
    Stack,
    Chip,
    Divider,
    FormControlLabel,
    Checkbox,
} from '@mui/material';
import {
    RocketLaunch as RocketIcon,
    AccessTime as TimeIcon,
    AttachMoney as MoneyIcon,
    Description as FileIcon,
} from '@mui/icons-material';

interface BatchExtractionConfirmDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    candidateCount: number;
    estimatedCost: number;
    estimatedTimeMinutes: number;
    skippedCount?: number;
}

const BatchExtractionConfirmDialog = ({
    open,
    onClose,
    onConfirm,
    candidateCount,
    estimatedCost,
    estimatedTimeMinutes,
    skippedCount = 0,
}: BatchExtractionConfirmDialogProps) => {
    const [accepted, setAccepted] = useState(false);

    const handleClose = () => {
        setAccepted(false);
        onClose();
    };

    const handleConfirm = () => {
        setAccepted(false);
        onConfirm();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                <Box display="flex" alignItems="center" gap={2}>
                    <RocketIcon color="primary" fontSize="large" />
                    <Box>
                        <Typography variant="h6">Extraction en Masse</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Confirmation requise
                        </Typography>
                    </Box>
                </Box>
            </DialogTitle>

            <DialogContent>
                <Stack spacing={3} mt={1}>
                    <Alert severity="info" variant="outlined">
                        Vous êtes sur le point de lancer l'extraction de compétences pour <strong>{candidateCount} candidat{candidateCount > 1 ? 's' : ''}</strong>.
                        {skippedCount > 0 && (
                            <Box mt={1}>
                                <Typography variant="caption" color="text.secondary">
                                    (Note: {skippedCount} candidat{skippedCount > 1 ? 's' : ''} déjà traité{skippedCount > 1 ? 's' : ''} ser{skippedCount > 1 ? 'ont' : 'a'} ignoré{skippedCount > 1 ? 's' : ''})
                                </Typography>
                            </Box>
                        )}
                    </Alert>

                    <Box
                        p={3}
                        bgcolor="primary.50"
                        borderRadius={2}
                        border={1}
                        borderColor="primary.100"
                    >
                        <Stack spacing={2}>
                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                <Box display="flex" alignItems="center" gap={1}>
                                    <FileIcon color="action" fontSize="small" />
                                    <Typography variant="body2">Volume</Typography>
                                </Box>
                                <Typography variant="subtitle1" fontWeight="bold">
                                    {candidateCount} CVs
                                </Typography>
                            </Box>

                            <Divider />

                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                <Box display="flex" alignItems="center" gap={1}>
                                    <MoneyIcon color="action" fontSize="small" />
                                    <Typography variant="body2">Coût estimé</Typography>
                                </Box>
                                <Chip
                                    label={`~$${estimatedCost.toFixed(2)}`}
                                    color="primary"
                                    size="small"
                                    variant="filled"
                                />
                            </Box>

                            <Divider />

                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                <Box display="flex" alignItems="center" gap={1}>
                                    <TimeIcon color="action" fontSize="small" />
                                    <Typography variant="body2">Temps estimé</Typography>
                                </Box>
                                <Typography variant="subtitle1" fontWeight="bold">
                                    ~{estimatedTimeMinutes} min
                                </Typography>
                            </Box>
                        </Stack>
                    </Box>

                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={accepted}
                                onChange={(e) => setAccepted(e.target.checked)}
                                color="primary"
                            />
                        }
                        label={
                            <Typography variant="body2">
                                J'ai lu et j'accepte les coûts estimés pour cette opération.
                            </Typography>
                        }
                    />
                </Stack>
            </DialogContent>

            <DialogActions>
                <Button onClick={handleClose} color="inherit">
                    Annuler
                </Button>
                <Button
                    onClick={handleConfirm}
                    variant="contained"
                    color="primary"
                    startIcon={<RocketIcon />}
                    disabled={!accepted}
                >
                    Lancer l'extraction
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default BatchExtractionConfirmDialog;
