import { Box, Chip, Stack, Tooltip } from '@mui/material';
import {
    CheckCircle as BSPIcon,
    LocalHospital as RCRIcon,
    AccessTime as TimeIcon,
    DirectionsCar as VehicleIcon,
    Language as LanguageIcon,
    Star as StarIcon,
} from '@mui/icons-material';

interface CandidateBadgesProps {
    hasBSP?: boolean;
    hasRCR?: boolean;
    hasSSIAP?: boolean;
    available24_7?: boolean;
    availableDays?: boolean;
    availableNights?: boolean;
    availableWeekends?: boolean;
    hasVehicle?: boolean;
    languages?: Array<{ language: string; level?: string }>;
    globalRating?: number | null;
    size?: 'small' | 'medium';
    maxBadges?: number; // Limite le nombre de badges affichés
}

const CandidateBadges = ({
    hasBSP,
    hasRCR,
    hasSSIAP,
    available24_7,
    availableDays,
    availableNights,
    availableWeekends,
    hasVehicle,
    languages = [],
    globalRating,
    size = 'small',
    maxBadges,
}: CandidateBadgesProps) => {
    const badges = [];

    // Badge BSP (vert - priorité haute)
    if (hasBSP) {
        badges.push(
            <Tooltip key="bsp" title="Permis BSP valide">
                <Chip
                    icon={<BSPIcon />}
                    label="BSP"
                    size={size}
                    sx={{
                        bgcolor: '#4CAF50',
                        color: 'white',
                        fontWeight: 'bold',
                        '& .MuiChip-icon': { color: 'white' },
                    }}
                />
            </Tooltip>
        );
    }

    // Badge RCR (bleu)
    if (hasRCR) {
        badges.push(
            <Tooltip key="rcr" title="Certification RCR/DEA">
                <Chip
                    icon={<RCRIcon />}
                    label="RCR"
                    size={size}
                    sx={{
                        bgcolor: '#2196F3',
                        color: 'white',
                        fontWeight: 'bold',
                        '& .MuiChip-icon': { color: 'white' },
                    }}
                />
            </Tooltip>
        );
    }

    // Badge SSIAP (bleu foncé)
    if (hasSSIAP) {
        badges.push(
            <Tooltip key="ssiap" title="Certification SSIAP">
                <Chip
                    label="SSIAP"
                    size={size}
                    sx={{
                        bgcolor: '#1565C0',
                        color: 'white',
                        fontWeight: 'bold',
                    }}
                />
            </Tooltip>
        );
    }

    // Badge Disponibilité 24/7 (orange)
    if (available24_7) {
        badges.push(
            <Tooltip key="24-7" title="Disponible 24/7">
                <Chip
                    icon={<TimeIcon />}
                    label="24/7"
                    size={size}
                    sx={{
                        bgcolor: '#FF9800',
                        color: 'white',
                        fontWeight: 'bold',
                        '& .MuiChip-icon': { color: 'white' },
                    }}
                />
            </Tooltip>
        );
    } else {
        // Autres disponibilités (orange clair)
        const availabilityLabels = [];
        if (availableDays) availabilityLabels.push('Jour');
        if (availableNights) availabilityLabels.push('Nuit');
        if (availableWeekends) availabilityLabels.push('FDS');

        if (availabilityLabels.length > 0) {
            badges.push(
                <Tooltip key="availability" title={`Disponible: ${availabilityLabels.join(', ')}`}>
                    <Chip
                        icon={<TimeIcon />}
                        label={availabilityLabels.join('/')}
                        size={size}
                        sx={{
                            bgcolor: '#FFB74D',
                            color: 'white',
                            fontWeight: 'bold',
                            '& .MuiChip-icon': { color: 'white' },
                        }}
                    />
                </Tooltip>
            );
        }
    }

    // Badge Véhicule (gris)
    if (hasVehicle) {
        badges.push(
            <Tooltip key="vehicle" title="Possède un véhicule">
                <Chip
                    icon={<VehicleIcon />}
                    label="Véhicule"
                    size={size}
                    sx={{
                        bgcolor: '#757575',
                        color: 'white',
                        '& .MuiChip-icon': { color: 'white' },
                    }}
                />
            </Tooltip>
        );
    }

    // Badge Langues (violet)
    if (languages.length > 0) {
        const languageNames = languages.map(l => l.language).join(', ');
        const label = languages.length === 1 ? languages[0].language : `${languages.length} langues`;

        badges.push(
            <Tooltip key="languages" title={languageNames}>
                <Chip
                    icon={<LanguageIcon />}
                    label={label}
                    size={size}
                    sx={{
                        bgcolor: '#9C27B0',
                        color: 'white',
                        '& .MuiChip-icon': { color: 'white' },
                    }}
                />
            </Tooltip>
        );
    }

    // Badge Note (doré si >= 8)
    if (globalRating !== null && globalRating !== undefined && globalRating >= 7) {
        badges.push(
            <Tooltip key="rating" title={`Note globale: ${globalRating}/10`}>
                <Chip
                    icon={<StarIcon />}
                    label={`${globalRating}/10`}
                    size={size}
                    sx={{
                        bgcolor: globalRating >= 8 ? '#FFD700' : '#FFA726',
                        color: globalRating >= 8 ? '#000' : 'white',
                        fontWeight: 'bold',
                        '& .MuiChip-icon': { color: globalRating >= 8 ? '#000' : 'white' },
                    }}
                />
            </Tooltip>
        );
    }

    // Limiter le nombre de badges si maxBadges est défini
    const displayedBadges = maxBadges ? badges.slice(0, maxBadges) : badges;
    const hiddenCount = maxBadges && badges.length > maxBadges ? badges.length - maxBadges : 0;

    if (displayedBadges.length === 0) {
        return null;
    }

    return (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
            {displayedBadges}
            {hiddenCount > 0 && (
                <Chip
                    label={`+${hiddenCount}`}
                    size={size}
                    variant="outlined"
                    sx={{ fontWeight: 'bold' }}
                />
            )}
        </Stack>
    );
};

export default CandidateBadges;
