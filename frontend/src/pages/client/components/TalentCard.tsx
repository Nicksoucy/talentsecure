import {
    Card,
    CardContent,
    Typography,
    Box,
    Chip,
    Rating,
    Stack,
    Button,
    Checkbox,
} from '@mui/material';
import {
    CheckCircle as CheckCircleIcon,
    DirectionsCar as CarIcon,
    Security as SecurityIcon,
    Favorite as FavoriteIcon,
} from '@mui/icons-material';
import { TalentPreview } from '@/services/talent-marketplace.service';

interface TalentCardProps {
    talent: TalentPreview;
    selected: boolean;
    onToggleSelect: (id: string) => void;
}

export default function TalentCard({ talent, selected, onToggleSelect }: TalentCardProps) {
    return (
        <Card
            sx={{
                position: 'relative',
                border: selected ? '2px solid' : '1px solid',
                borderColor: selected ? 'primary.main' : 'divider',
                transition: 'all 0.2s',
                '&:hover': {
                    boxShadow: 4,
                },
            }}
        >
            <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
                    <Box>
                        <Typography variant="h6" fontWeight="bold">
                            {talent.firstName} ••••
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {talent.city}, {talent.province}
                        </Typography>
                    </Box>
                    <Checkbox
                        checked={selected}
                        onChange={() => onToggleSelect(talent.id)}
                        icon={<FavoriteIcon />}
                        checkedIcon={<FavoriteIcon />}
                        sx={{
                            color: 'grey.400',
                            '&.Mui-checked': {
                                color: 'primary.main',
                            },
                        }}
                    />
                </Box>

                {/* Rating */}
                <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <Rating value={talent.globalRating / 2} precision={0.1} readOnly size="small" />
                    <Typography variant="h6" fontWeight="bold" color="primary.main">
                        {talent.globalRating?.toFixed(1)}/10
                    </Typography>
                </Box>

                {/* Certifications & Availability */}
                <Stack direction="row" spacing={1} flexWrap="wrap" mb={2}>
                    {talent.hasBSP && (
                        <Chip
                            icon={<SecurityIcon />}
                            label="BSP"
                            size="small"
                            color="success"
                            variant="outlined"
                        />
                    )}
                    {talent.hasVehicle && (
                        <Chip
                            icon={<CarIcon />}
                            label={talent.vehicleType || 'Véhicule'}
                            size="small"
                            color="info"
                            variant="outlined"
                        />
                    )}
                    {talent.available24_7 && (
                        <Chip
                            icon={<CheckCircleIcon />}
                            label="24/7"
                            size="small"
                            color="primary"
                            variant="outlined"
                        />
                    )}
                    {talent.availableImmediately && (
                        <Chip
                            label="Dispo immédiat"
                            size="small"
                            color="warning"
                            variant="outlined"
                        />
                    )}
                </Stack>

                {/* Experience (limited) */}
                {talent.experiences && talent.experiences.length > 0 && (
                    <Box mb={2}>
                        <Typography variant="caption" color="text.secondary" fontWeight="bold">
                            Expérience récente
                        </Typography>
                        {talent.experiences.slice(0, 2).map((exp, idx) => (
                            <Typography key={idx} variant="body2" color="text.secondary">
                                • {exp.position} - {exp.durationMonths ? `${Math.floor(exp.durationMonths / 12)} ans` : 'N/A'}
                            </Typography>
                        ))}
                    </Box>
                )}

                {/* Languages */}
                {talent.languages && talent.languages.length > 0 && (
                    <Box mb={2}>
                        <Typography variant="caption" color="text.secondary" fontWeight="bold">
                            Langues
                        </Typography>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                            {talent.languages.map((lang, idx) => (
                                <Chip key={idx} label={lang.language} size="small" variant="outlined" />
                            ))}
                        </Stack>
                    </Box>
                )}

                {/* Blurred Contact Info */}
                <Box
                    sx={{
                        mt: 2,
                        p: 1.5,
                        bgcolor: 'grey.100',
                        borderRadius: 1,
                        filter: 'blur(4px)',
                        userSelect: 'none',
                        pointerEvents: 'none',
                    }}
                >
                    <Typography variant="body2">Nom: ••••••••</Typography>
                    <Typography variant="body2">Email: ••••@••••.com</Typography>
                    <Typography variant="body2">Tél: (•••) •••-••••</Typography>
                </Box>

                <Button
                    variant={selected ? 'contained' : 'outlined'}
                    fullWidth
                    sx={{ mt: 2 }}
                    onClick={() => onToggleSelect(talent.id)}
                >
                    {selected ? 'Retiré de la sélection' : 'Ajouter à ma sélection'}
                </Button>
            </CardContent>
        </Card>
    );
}
