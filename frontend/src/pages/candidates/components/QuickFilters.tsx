import { Box, Chip, Typography } from '@mui/material';
import {
    LocalPolice as BspIcon,
    DirectionsCar as CarIcon,
    AccessTime as TimeIcon,
    Star as StarIcon,
    Nightlight as NightIcon
} from '@mui/icons-material';
import { AdvancedFiltersState } from './AdvancedFiltersPanel';

interface QuickFiltersProps {
    onApplyPreset: (preset: Partial<AdvancedFiltersState>) => void;
}

export default function QuickFilters({ onApplyPreset }: QuickFiltersProps) {

    const presets = [
        {
            label: "Urgence 24/7",
            icon: <TimeIcon fontSize="small" />,
            color: "error" as const,
            filter: {
                availability: {
                    available24_7: true,
                    availableImmediately: true,
                    availableDays: false,
                    availableNights: false,
                    availableWeekends: false
                }
            }
        },
        {
            label: "Élite & Excellent",
            icon: <StarIcon fontSize="small" />,
            color: "warning" as const,
            filter: {
                minRating: 9
            }
        },
        {
            label: "Véhiculé avec BSP",
            icon: <CarIcon fontSize="small" />,
            color: "info" as const,
            filter: {
                hasVehicle: true,
                certifications: ['BSP']
            }
        },
        {
            label: "Disponible Nuit",
            icon: <NightIcon fontSize="small" />,
            color: "default" as const,
            filter: {
                availability: {
                    available24_7: false,
                    availableImmediately: false,
                    availableDays: false,
                    availableNights: true,
                    availableWeekends: false
                }
            }
        }
    ];

    return (
        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" mb={2}>
            <Typography variant="body2" color="text.secondary" mr={1}>
                Filtres rapides :
            </Typography>
            {presets.map((preset, index) => (
                <Chip
                    key={index}
                    label={preset.label}
                    icon={preset.icon}
                    onClick={() => onApplyPreset(preset.filter as any)}
                    color={preset.color}
                    variant="outlined"
                    clickable
                    sx={{
                        borderColor: preset.color === 'default' ? 'divider' : `${preset.color}.main`,
                        color: preset.color === 'default' ? 'text.primary' : `${preset.color}.main`,
                        '&:hover': {
                            bgcolor: preset.color === 'default' ? 'action.hover' : `${preset.color}.light`,
                            color: preset.color === 'default' ? 'text.primary' : `${preset.color}.contrastText`,
                            '& .MuiChip-icon': {
                                color: 'inherit'
                            }
                        }
                    }}
                />
            ))}
        </Box>
    );
}
