import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Typography,
    Chip,
    Stack,
    CircularProgress,
    Alert,
} from '@mui/material';
import {
    Timeline,
    TimelineItem,
    TimelineSeparator,
    TimelineConnector,
    TimelineContent,
    TimelineDot,
    TimelineOppositeContent,
} from '@mui/lab';
import {
    CheckCircle as SuccessIcon,
    Error as ErrorIcon,
    Schedule as ClockIcon,
    Code as CodeIcon,
    TrendingUp as TrendingIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { prospectService } from '@/services/prospect.service';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ExtractionHistoryDialogProps {
    open: boolean;
    onClose: () => void;
    prospectId: string;
    prospectName?: string;
}

const ExtractionHistoryDialog = ({
    open,
    onClose,
    prospectId,
    prospectName,
}: ExtractionHistoryDialogProps) => {
    const { data, isLoading, error } = useQuery({
        queryKey: ['prospect-extraction-history', prospectId],
        queryFn: () => prospectService.getProspectExtractionHistory(prospectId),
        enabled: open,
    });

    const formatCost = (cost: number | null) => {
        if (!cost) return '-';
        return `$${cost.toFixed(4)}`;
    };

    const formatDuration = (ms: number | null) => {
        if (!ms) return '-';
        return `${(ms / 1000).toFixed(1)}s`;
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box display="flex" alignItems="center" gap={2}>
                    <ClockIcon color="primary" />
                    <Box>
                        <Typography variant="h6">Historique d'Extraction</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {prospectName || data?.prospect.name || 'Chargement...'}
                        </Typography>
                    </Box>
                </Box>
            </DialogTitle>

            <DialogContent>
                {isLoading && (
                    <Box display="flex" justifyContent="center" py={4}>
                        <CircularProgress />
                    </Box>
                )}

                {error && (
                    <Alert severity="error">
                        Erreur lors du chargement de l'historique
                    </Alert>
                )}

                {data && (
                    <>
                        {/* Current Stats */}
                        <Box mb={3} p={2} bgcolor="primary.50" borderRadius={2}>
                            <Stack direction="row" spacing={2} alignItems="center">
                                <TrendingIcon color="primary" />
                                <Box>
                                    <Typography variant="body2" color="text.secondary">
                                        Compétences actuelles
                                    </Typography>
                                    <Typography variant="h5" fontWeight="bold" color="primary">
                                        {data.currentSkillsCount}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Box>

                        {/* Timeline */}
                        {data.logs.length === 0 ? (
                            <Alert severity="info">
                                Aucune extraction n'a encore été effectuée pour ce prospect
                            </Alert>
                        ) : (
                            <Timeline position="right">
                                {data.logs.map((log, index) => (
                                    <TimelineItem key={log.id}>
                                        <TimelineOppositeContent color="text.secondary" sx={{ flex: 0.3 }}>
                                            <Typography variant="caption">
                                                {format(new Date(log.date), 'dd MMM yyyy', { locale: fr })}
                                            </Typography>
                                            <Typography variant="caption" display="block">
                                                {format(new Date(log.date), 'HH:mm', { locale: fr })}
                                            </Typography>
                                        </TimelineOppositeContent>

                                        <TimelineSeparator>
                                            <TimelineDot color={log.success ? 'success' : 'error'}>
                                                {log.success ? <SuccessIcon fontSize="small" /> : <ErrorIcon fontSize="small" />}
                                            </TimelineDot>
                                            {index < data.logs.length - 1 && <TimelineConnector />}
                                        </TimelineSeparator>

                                        <TimelineContent>
                                            <Box
                                                sx={{
                                                    p: 2,
                                                    bgcolor: log.success ? 'success.50' : 'error.50',
                                                    borderRadius: 2,
                                                    borderLeft: 4,
                                                    borderColor: log.success ? 'success.main' : 'error.main',
                                                }}
                                            >
                                                <Stack spacing={1}>
                                                    <Box display="flex" alignItems="center" gap={1}>
                                                        <CodeIcon fontSize="small" color="action" />
                                                        <Typography variant="subtitle2" fontWeight="bold">
                                                            {log.method}
                                                            {log.model && ` (${log.model})`}
                                                        </Typography>
                                                    </Box>

                                                    {log.success ? (
                                                        <>
                                                            <Typography variant="body2" color="text.secondary">
                                                                ✅ {log.skillsFound} compétence{log.skillsFound > 1 ? 's' : ''} extraite{log.skillsFound > 1 ? 's' : ''}
                                                            </Typography>
                                                            <Stack direction="row" spacing={1} flexWrap="wrap">
                                                                {log.totalCost && (
                                                                    <Chip
                                                                        size="small"
                                                                        label={`Coût: ${formatCost(log.totalCost)}`}
                                                                        variant="outlined"
                                                                    />
                                                                )}
                                                                {log.processingTimeMs && (
                                                                    <Chip
                                                                        size="small"
                                                                        label={`Durée: ${formatDuration(log.processingTimeMs)}`}
                                                                        variant="outlined"
                                                                    />
                                                                )}
                                                                {log.promptTokens && log.completionTokens && (
                                                                    <Chip
                                                                        size="small"
                                                                        label={`Tokens: ${log.promptTokens + log.completionTokens}`}
                                                                        variant="outlined"
                                                                    />
                                                                )}
                                                            </Stack>
                                                        </>
                                                    ) : (
                                                        <Typography variant="body2" color="error">
                                                            ❌ {log.errorMessage || 'Erreur inconnue'}
                                                        </Typography>
                                                    )}
                                                </Stack>
                                            </Box>
                                        </TimelineContent>
                                    </TimelineItem>
                                ))}
                            </Timeline>
                        )}
                    </>
                )}
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose}>Fermer</Button>
            </DialogActions>
        </Dialog>
    );
};

export default ExtractionHistoryDialog;
