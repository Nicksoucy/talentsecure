import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Typography,
    Grid,
    Avatar,
    Chip,
    Divider,
    Rating,
    IconButton,
} from '@mui/material';
import { Close as CloseIcon, Check as CheckIcon, Close as CrossIcon } from '@mui/icons-material';
import { Candidate } from '@/types';

interface CandidateComparatorDialogProps {
    open: boolean;
    onClose: () => void;
    candidates: Candidate[];
}

export default function CandidateComparatorDialog({
    open,
    onClose,
    candidates,
}: CandidateComparatorDialogProps) {
    if (!candidates || candidates.length === 0) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h5" fontWeight="bold">
                    Comparateur de candidats
                </Typography>
                <IconButton onClick={onClose}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers>
                <Grid container spacing={0} sx={{ border: '1px solid #e0e0e0', borderRadius: 2 }}>
                    {/* Header Row: Names & Photos */}
                    <Grid item xs={12} display="flex">
                        <Box sx={{ width: 200, p: 2, borderRight: '1px solid #e0e0e0', bgcolor: 'grey.50' }}>
                            <Typography variant="subtitle2" color="text.secondary">Candidat</Typography>
                        </Box>
                        {candidates.map((candidate) => (
                            <Box key={candidate.id} sx={{ flex: 1, p: 2, borderRight: '1px solid #e0e0e0', textAlign: 'center' }}>
                                <Avatar
                                    sx={{ width: 64, height: 64, mx: 'auto', mb: 1, bgcolor: 'primary.main' }}
                                >
                                    {candidate.firstName[0]}
                                </Avatar>
                                <Typography variant="h6" fontWeight="bold">
                                    {candidate.firstName} {candidate.lastName}
                                </Typography>
                                <Chip label={candidate.status} size="small" color="primary" variant="outlined" sx={{ mt: 1 }} />
                            </Box>
                        ))}
                    </Grid>

                    {/* Rating */}
                    <Grid item xs={12} display="flex" sx={{ borderTop: '1px solid #e0e0e0' }}>
                        <Box sx={{ width: 200, p: 2, borderRight: '1px solid #e0e0e0', bgcolor: 'grey.50' }}>
                            <Typography variant="subtitle2">Note Globale</Typography>
                        </Box>
                        {candidates.map((candidate) => (
                            <Box key={candidate.id} sx={{ flex: 1, p: 2, borderRight: '1px solid #e0e0e0', textAlign: 'center' }}>
                                <Rating value={candidate.globalRating || 0} readOnly precision={0.5} />
                                <Typography variant="body2" color="text.secondary">{candidate.globalRating}/10</Typography>
                            </Box>
                        ))}
                    </Grid>

                    {/* Location */}
                    <Grid item xs={12} display="flex" sx={{ borderTop: '1px solid #e0e0e0' }}>
                        <Box sx={{ width: 200, p: 2, borderRight: '1px solid #e0e0e0', bgcolor: 'grey.50' }}>
                            <Typography variant="subtitle2">Ville</Typography>
                        </Box>
                        {candidates.map((candidate) => (
                            <Box key={candidate.id} sx={{ flex: 1, p: 2, borderRight: '1px solid #e0e0e0', textAlign: 'center' }}>
                                <Typography>{candidate.city}</Typography>
                            </Box>
                        ))}
                    </Grid>

                    {/* Vehicule & Permis */}
                    <Grid item xs={12} display="flex" sx={{ borderTop: '1px solid #e0e0e0' }}>
                        <Box sx={{ width: 200, p: 2, borderRight: '1px solid #e0e0e0', bgcolor: 'grey.50' }}>
                            <Typography variant="subtitle2">Mobilité</Typography>
                        </Box>
                        {candidates.map((candidate) => (
                            <Box key={candidate.id} sx={{ flex: 1, p: 2, borderRight: '1px solid #e0e0e0' }}>
                                <Box display="flex" flexDirection="column" gap={1} alignItems="center">
                                    <Box display="flex" alignItems="center" gap={1}>
                                        {candidate.hasVehicle ? <CheckIcon color="success" /> : <CrossIcon color="error" />}
                                        <Typography variant="body2">Véhicule</Typography>
                                    </Box>
                                    <Box display="flex" alignItems="center" gap={1}>
                                        {candidate.hasDriverLicense ? <CheckIcon color="success" /> : <CrossIcon color="error" />}
                                        <Typography variant="body2">Permis</Typography>
                                    </Box>
                                </Box>
                            </Box>
                        ))}
                    </Grid>

                    {/* BSP */}
                    <Grid item xs={12} display="flex" sx={{ borderTop: '1px solid #e0e0e0' }}>
                        <Box sx={{ width: 200, p: 2, borderRight: '1px solid #e0e0e0', bgcolor: 'grey.50' }}>
                            <Typography variant="subtitle2">BSP</Typography>
                        </Box>
                        {candidates.map((candidate) => (
                            <Box key={candidate.id} sx={{ flex: 1, p: 2, borderRight: '1px solid #e0e0e0', textAlign: 'center' }}>
                                {candidate.hasBSP ? (
                                    <Chip label="OUI" color="success" size="small" />
                                ) : (
                                    <Chip label="NON" color="error" size="small" />
                                )}
                            </Box>
                        ))}
                    </Grid>

                    {/* Skills/Certifications */}
                    <Grid item xs={12} display="flex" sx={{ borderTop: '1px solid #e0e0e0' }}>
                        <Box sx={{ width: 200, p: 2, borderRight: '1px solid #e0e0e0', bgcolor: 'grey.50' }}>
                            <Typography variant="subtitle2">Certifications</Typography>
                        </Box>
                        {candidates.map((candidate) => (
                            <Box key={candidate.id} sx={{ flex: 1, p: 2, borderRight: '1px solid #e0e0e0' }}>
                                <Box display="flex" flexWrap="wrap" gap={0.5} justifyContent="center">
                                    {candidate.certifications?.map((c, i) => (
                                        <Chip key={i} label={c.name} size="small" variant="outlined" />
                                    ))}
                                    {(!candidate.certifications || candidate.certifications.length === 0) && '-'}
                                </Box>
                            </Box>
                        ))}
                    </Grid>

                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="primary">Fermer</Button>
            </DialogActions>
        </Dialog>
    );
}
