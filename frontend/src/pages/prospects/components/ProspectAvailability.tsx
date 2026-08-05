import { Box, Card, CardContent, Chip, Divider, Stack, Typography } from '@mui/material';
import { Schedule as ScheduleIcon } from '@mui/icons-material';
import { availabilityLabels } from '@/utils/availability';

interface ProspectAvailabilityProps {
    available24_7?: boolean;
    availableDays?: boolean;
    availableEvenings?: boolean;
    availableNights?: boolean;
    availableWeekends?: boolean;
}

/**
 * Disponibilités déclarées au formulaire GHL « Renseignements étudiants ».
 * Lecture seule : la donnée vient du formulaire et est reprise telle quelle à
 * la conversion en candidat (où RH peut alors la corriger).
 */
const ProspectAvailability = (props: ProspectAvailabilityProps) => {
    const labels = availabilityLabels(props);

    return (
        <Card>
            <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <ScheduleIcon color="primary" />
                    <Typography variant="h6">Disponibilités</Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />
                {labels.length > 0 ? (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {labels.map((label) => (
                            <Chip key={label} label={label} size="small" color="primary" variant="outlined" />
                        ))}
                    </Stack>
                ) : (
                    <Typography variant="body2" color="textSecondary">
                        Non spécifié
                    </Typography>
                )}
            </CardContent>
        </Card>
    );
};

export default ProspectAvailability;
