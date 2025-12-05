import { useQuery } from '@tanstack/react-query';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Avatar,
    Chip,
    Button,
    Grid,
    Skeleton,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { candidateService } from '@/services/candidate.service';
import { Candidate } from '@/types';
import { Star as StarIcon } from '@mui/icons-material';

interface SimilarCandidatesProps {
    currentCandidateId: string;
}

export default function SimilarCandidates({ currentCandidateId }: SimilarCandidatesProps) {
    const navigate = useNavigate();

    const { data, isLoading } = useQuery({
        queryKey: ['similar-candidates', currentCandidateId],
        queryFn: () => candidateService.getSimilarCandidates(currentCandidateId),
        enabled: !!currentCandidateId,
    });

    if (isLoading) {
        return (
            <Box sx={{ mb: 3 }}>
                <Typography variant="h6" gutterBottom>Candidats similaires</Typography>
                <Grid container spacing={2}>
                    {[1, 2, 3].map((i) => (
                        <Grid item xs={12} md={4} key={i}>
                            <Skeleton variant="rectangular" height={150} sx={{ borderRadius: 2 }} />
                        </Grid>
                    ))}
                </Grid>
            </Box>
        );
    }

    const candidates = data?.data || [];

    if (candidates.length === 0) {
        return null;
    }

    return (
        <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                💡 Candidats similaires
                <Chip label="Suggéré par IA" size="small" color="primary" variant="outlined" />
            </Typography>

            <Grid container spacing={2}>
                {candidates.map((candidate: Candidate) => (
                    <Grid item xs={12} md={4} key={candidate.id}>
                        <Card
                            variant="outlined"
                            sx={{
                                height: '100%',
                                transition: 'all 0.2s',
                                '&:hover': {
                                    borderColor: 'primary.main',
                                    transform: 'translateY(-2px)',
                                    boxShadow: 2,
                                },
                                cursor: 'pointer',
                            }}
                            onClick={() => navigate(`/candidates/${candidate.id}`)}
                        >
                            <CardContent>
                                <Box display="flex" alignItems="center" gap={2} mb={2}>
                                    <Avatar
                                        sx={{
                                            bgcolor: 'primary.light',
                                            color: 'primary.contrastText',
                                        }}
                                    >
                                        {candidate.firstName[0]}
                                        {candidate.lastName[0]}
                                    </Avatar>
                                    <Box>
                                        <Typography variant="subtitle1" fontWeight="bold">
                                            {candidate.firstName} {candidate.lastName}
                                        </Typography>
                                        <Box display="flex" alignItems="center" gap={0.5}>
                                            <StarIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                                            <Typography variant="body2" color="text.secondary">
                                                {candidate.globalRating || 'N/A'}/10
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Box>

                                <Box display="flex" gap={1} flexWrap="wrap">
                                    {candidate.city && (
                                        <Chip label={candidate.city} size="small" variant="outlined" />
                                    )}
                                    {candidate.hasBSP && (
                                        <Chip label="BSP" size="small" color="success" variant="outlined" />
                                    )}
                                    {candidate.hasVehicle && (
                                        <Chip label="Véhicule" size="small" color="info" variant="outlined" />
                                    )}
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
}
