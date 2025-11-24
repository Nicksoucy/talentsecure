import React from 'react';
import {
    Box,
    Typography,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Grid,
    Paper,
    TableContainer,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Chip,
    Tooltip,
    IconButton,
} from '@mui/material';
import {
    AutoAwesome as AutoAwesomeIcon,
    Category as CategoryIcon,
    Close as CloseIcon,
    Visibility as VisibilityIcon,
} from '@mui/icons-material';

interface BatchResultsDialogProps {
    open: boolean;
    onClose: () => void;
    results: any;
    onViewSkills: (skills: any[], name: string, candidateId: string) => void;
}

const BatchResultsDialog: React.FC<BatchResultsDialogProps> = ({
    open,
    onClose,
    results,
    onViewSkills,
}) => {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Typography variant="h6">Résultats de l'Extraction Batch</Typography>
            </DialogTitle>
            <DialogContent>
                {results && (
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
                                        {results.summary.total}
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
                                        {results.summary.processed || 0}
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
                                        {results.summary.skipped || 0}
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
                                        {results.summary.failed}
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
                                    {results.summary.totalSkillsExtracted}
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
                                    {results.results.map((result: any, index: number) => (
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
                                                                onViewSkills(result.skills, result.name, result.candidateId);
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
                <Button onClick={onClose} variant="contained">
                    Fermer
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default BatchResultsDialog;
