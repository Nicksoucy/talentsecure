import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Box,
    Container,
    Typography,
    TextField,
    Grid,
    Button,
    Autocomplete,
    CircularProgress,
    Alert,
    Chip,
    FormGroup,
    FormControlLabel,
    Checkbox,
    Paper,
    Badge,
} from '@mui/material';
import {
    Search as SearchIcon,
    ShoppingCart as CartIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { talentMarketplaceService, TalentPreview } from '@/services/talent-marketplace.service';
import TalentCard from './components/TalentCard';

export default function TalentMarketplacePage() {
    const { enqueueSnackbar } = useSnackbar();
    const [selectedCity, setSelectedCity] = useState<string>('');
    const [selectedTalents, setSelectedTalents] = useState<Set<string>>(new Set());
    const [filters, setFilters] = useState({
        minRating: 7,
        hasBSP: false,
        hasVehicle: false,
        available24_7: false,
    });

    // Fetch available cities
    const { data: citiesData } = useQuery({
        queryKey: ['marketplace-cities'],
        queryFn: () => talentMarketplaceService.getAvailableCities(),
    });

    // Search talents
    const {
        data: talentsData,
        isLoading,
        error,
    } = useQuery({
        queryKey: ['marketplace-talents', selectedCity, filters],
        queryFn: () =>
            talentMarketplaceService.searchByCity({
                city: selectedCity,
                ...filters,
            }),
        enabled: !!selectedCity,
    });

    const handleToggleSelect = (id: string) => {
        setSelectedTalents((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const handleViewSelection = () => {
        enqueueSnackbar(
            `${selectedTalents.size} candidat(s) sélectionné(s). Fonctionnalité de panier à venir !`,
            { variant: 'info' }
        );
    };

    const cities = citiesData?.data || [];
    const talents = talentsData?.data || [];

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            <Box mb={4}>
                <Typography variant="h4" fontWeight="bold" gutterBottom>
                    Banque de Talents Disponibles
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Parcourez nos candidats qualifiés par ville et ajoutez-les à votre sélection
                </Typography>
            </Box>

            {/* Search & Filters */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={6}>
                        <Autocomplete
                            options={cities}
                            getOptionLabel={(option) => `${option.city}, ${option.province} (${option.count})`}
                            value={cities.find((c) => c.city === selectedCity) || null}
                            onChange={(_, newValue) => setSelectedCity(newValue?.city || '')}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Rechercher une ville"
                                    placeholder="Ex: Montréal, Québec, Laval..."
                                    InputProps={{
                                        ...params.InputProps,
                                        startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                                    }}
                                />
                            )}
                        />
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <FormGroup row>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={filters.hasBSP}
                                        onChange={(e) => setFilters({ ...filters, hasBSP: e.target.checked })}
                                    />
                                }
                                label="BSP"
                            />
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={filters.hasVehicle}
                                        onChange={(e) => setFilters({ ...filters, hasVehicle: e.target.checked })}
                                    />
                                }
                                label="Véhicule"
                            />
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={filters.available24_7}
                                        onChange={(e) => setFilters({ ...filters, available24_7: e.target.checked })}
                                    />
                                }
                                label="Dispo 24/7"
                            />
                        </FormGroup>
                    </Grid>
                </Grid>
            </Paper>

            {/* Selection Counter */}
            {selectedTalents.size > 0 && (
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Chip
                        label={`${selectedTalents.size} candidat(s) sélectionné(s)`}
                        color="primary"
                        variant="outlined"
                    />
                    <Button
                        variant="contained"
                        startIcon={
                            <Badge badgeContent={selectedTalents.size} color="error">
                                <CartIcon />
                            </Badge>
                        }
                        onClick={handleViewSelection}
                    >
                        Voir ma sélection
                    </Button>
                </Box>
            )}

            {/* Results */}
            {!selectedCity && (
                <Alert severity="info">
                    Sélectionnez une ville pour voir les candidats disponibles
                </Alert>
            )}

            {selectedCity && isLoading && (
                <Box display="flex" justifyContent="center" py={4}>
                    <CircularProgress />
                </Box>
            )}

            {selectedCity && error && (
                <Alert severity="error">
                    Erreur lors du chargement des candidats
                </Alert>
            )}

            {selectedCity && !isLoading && talents.length === 0 && (
                <Alert severity="warning">
                    Aucun candidat trouvé pour {selectedCity} avec ces filtres
                </Alert>
            )}

            {selectedCity && !isLoading && talents.length > 0 && (
                <>
                    <Typography variant="h6" gutterBottom>
                        {talents.length} candidat(s) disponible(s) à {selectedCity}
                    </Typography>
                    <Grid container spacing={3}>
                        {talents.map((talent) => (
                            <Grid item xs={12} sm={6} md={4} key={talent.id}>
                                <TalentCard
                                    talent={talent}
                                    selected={selectedTalents.has(talent.id)}
                                    onToggleSelect={handleToggleSelect}
                                />
                            </Grid>
                        ))}
                    </Grid>
                </>
            )}
        </Container>
    );
}
