import { Box, Card, CardContent, Grid, Typography, Divider, Stack } from '@mui/material';
import {
    CheckCircle as CheckCircleIcon,
    Cancel as CancelIcon,
    Schedule as ScheduleIcon,
    DirectionsCar as CarIcon,
    Work as WorkIcon,
    Language as LanguageIcon,
    VerifiedUser as VerifiedUserIcon,
} from '@mui/icons-material';
import { Candidate } from '@/types';
import CandidateBadges from './CandidateBadges';

interface QuickOverviewProps {
    candidate: Candidate;
}

const QuickOverview = ({ candidate }: QuickOverviewProps) => {
    // Helper pour afficher une ligne d'info
    const InfoRow = ({ icon, label, value, isPositive }: { icon: any; label: string; value: string | React.ReactNode; isPositive?: boolean }) => (
        <Box display="flex" alignItems="center" mb={1.5}>
            <Box mr={1.5} color="text.secondary" display="flex">
                {icon}
            </Box>
            <Box flexGrow={1}>
                <Typography variant="body2" color="text.secondary">
                    {label}
                </Typography>
                <Typography variant="body1" fontWeight={500} color={isPositive === false ? 'error.main' : 'text.primary'}>
                    {value}
                </Typography>
            </Box>
        </Box>
    );

    // Calcul de l'expérience totale (approximatif basé sur les expériences listées)
    const calculateTotalExperience = () => {
        if (!candidate.experiences || candidate.experiences.length === 0) return "Non spécifié";

        // Ici on pourrait faire un calcul plus complexe si on avait les dates exactes pour toutes les expériences
        // Pour l'instant on retourne le nombre d'expériences listées
        return `${candidate.experiences.length} poste(s) listé(s)`;
    };

    return (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardContent>
                <Box display="flex" alignItems="center" mb={2}>
                    <VerifiedUserIcon color="primary" sx={{ mr: 1 }} />
                    <Typography variant="h6">Aperçu Rapide</Typography>
                </Box>

                <Divider sx={{ mb: 2 }} />

                <Grid container spacing={3}>
                    {/* Colonne 1 : Critères Essentiels */}
                    <Grid item xs={12} md={4}>
                        <Typography variant="subtitle2" color="primary" gutterBottom sx={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700 }}>
                            Critères Essentiels
                        </Typography>

                        <InfoRow
                            icon={<VerifiedUserIcon fontSize="small" />}
                            label="Permis BSP"
                            value={candidate.hasBSP ? (
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <Typography component="span" fontWeight={500}>Valide</Typography>
                                    {candidate.bspExpiryDate && (
                                        <Typography component="span" variant="caption" color="text.secondary">
                                            (exp: {new Date(candidate.bspExpiryDate).toLocaleDateString('fr-CA')})
                                        </Typography>
                                    )}
                                </Stack>
                            ) : "Non"}
                            isPositive={candidate.hasBSP}
                        />

                        <InfoRow
                            icon={<CarIcon fontSize="small" />}
                            label="Véhicule"
                            value={candidate.hasVehicle ? "Oui" : "Non"}
                            isPositive={candidate.hasVehicle}
                        />

                        <InfoRow
                            icon={<LanguageIcon fontSize="small" />}
                            label="Langues"
                            value={candidate.languages && candidate.languages.length > 0
                                ? candidate.languages.map(l => l.language).join(', ')
                                : "Non spécifié"}
                        />
                    </Grid>

                    {/* Colonne 2 : Disponibilité */}
                    <Grid item xs={12} md={4}>
                        <Typography variant="subtitle2" color="primary" gutterBottom sx={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700 }}>
                            Disponibilité
                        </Typography>

                        <InfoRow
                            icon={<ScheduleIcon fontSize="small" />}
                            label="Horaires"
                            value={candidate.available24_7 ? "24/7 (Jour, Nuit, FDS)" : (
                                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                    {candidate.availableDays && <Typography component="span" variant="body2" sx={{ bgcolor: 'action.hover', px: 1, borderRadius: 1 }}>Jour</Typography>}
                                    {candidate.availableNights && <Typography component="span" variant="body2" sx={{ bgcolor: 'action.hover', px: 1, borderRadius: 1 }}>Nuit</Typography>}
                                    {candidate.availableWeekends && <Typography component="span" variant="body2" sx={{ bgcolor: 'action.hover', px: 1, borderRadius: 1 }}>FDS</Typography>}
                                    {!candidate.availableDays && !candidate.availableNights && !candidate.availableWeekends && "Non spécifié"}
                                </Stack>
                            )}
                        />

                        <InfoRow
                            icon={<CheckCircleIcon fontSize="small" />}
                            label="Statut Actuel"
                            value={candidate.availableImmediately ? "Disponible immédiatement" : "Préavis requis"}
                            isPositive={candidate.availableImmediately}
                        />
                    </Grid>

                    {/* Colonne 3 : Expérience & Badges */}
                    <Grid item xs={12} md={4}>
                        <Typography variant="subtitle2" color="primary" gutterBottom sx={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700 }}>
                            Expérience
                        </Typography>

                        <InfoRow
                            icon={<WorkIcon fontSize="small" />}
                            label="Historique"
                            value={calculateTotalExperience()}
                        />

                        <Box mt={2}>
                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                Badges & Certifications
                            </Typography>
                            <CandidateBadges
                                hasBSP={candidate.hasBSP}
                                hasRCR={candidate.hasRCR}
                                hasSSIAP={candidate.hasSSIAP}
                                available24_7={candidate.available24_7}
                                availableDays={candidate.availableDays}
                                availableNights={candidate.availableNights}
                                availableWeekends={candidate.availableWeekends}
                                hasVehicle={candidate.hasVehicle}
                                languages={candidate.languages}
                                globalRating={candidate.globalRating}
                                size="medium"
                            />
                        </Box>
                    </Grid>
                </Grid>
            </CardContent>
        </Card>
    );
};

export default QuickOverview;
