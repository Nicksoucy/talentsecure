import { Box, Checkbox, Typography, Chip, Paper, Stack } from '@mui/material';
import { Description as CVIcon } from '@mui/icons-material';
import { TalentPreview } from '@/services/talent-marketplace.service';

interface CVListItemProps {
    talent: TalentPreview;
    selected: boolean;
    onToggleSelect: (id: string) => void;
}

export default function CVListItem({ talent, selected, onToggleSelect }: CVListItemProps) {
    return (
        <Paper
            elevation={selected ? 3 : 1}
            sx={{
                p: 2,
                cursor: 'pointer',
                border: selected ? '2px solid' : '1px solid',
                borderColor: selected ? 'warning.main' : 'grey.300',
                bgcolor: selected ? 'warning.50' : 'background.paper',
                transition: 'all 0.2s',
                '&:hover': {
                    borderColor: 'warning.main',
                    bgcolor: 'warning.50',
                },
            }}
            onClick={() => onToggleSelect(talent.id)}
        >
            <Stack direction="row" alignItems="center" spacing={2}>
                {/* Checkbox */}
                <Checkbox
                    checked={selected}
                    onChange={() => onToggleSelect(talent.id)}
                    onClick={(e) => e.stopPropagation()}
                    sx={{ p: 0 }}
                />

                {/* CV Icon */}
                <CVIcon color="warning" fontSize="large" />

                {/* First Name */}
                <Box flex={1}>
                    <Typography variant="h6" fontWeight="bold">
                        {talent.firstName} ••••
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {talent.city}, {talent.province}
                    </Typography>
                </Box>

                {/* CV Badge */}
                <Chip
                    icon={<CVIcon />}
                    label="CV Disponible"
                    color="warning"
                    variant="filled"
                    size="medium"
                />

                {/* Availability badges (minimal) */}
                <Stack direction="row" spacing={0.5}>
                    {talent.available24_7 && (
                        <Chip label="24/7" size="small" color="success" variant="outlined" />
                    )}
                    {talent.availableDays && (
                        <Chip label="Jour" size="small" variant="outlined" />
                    )}
                    {talent.availableNights && (
                        <Chip label="Nuit" size="small" variant="outlined" />
                    )}
                    {talent.availableWeekends && (
                        <Chip label="Weekend" size="small" variant="outlined" />
                    )}
                    {talent.hasVehicle && (
                        <Chip label="Véhicule" size="small" color="primary" variant="outlined" />
                    )}
                </Stack>
            </Stack>
        </Paper>
    );
}
