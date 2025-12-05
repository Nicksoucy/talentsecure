import {
    Box,
    Grid,
    FormControl,
    FormLabel,
    FormGroup,
    FormControlLabel,
    Checkbox,
    Typography,
    Slider,
    Autocomplete,
    TextField,
    Chip,
    Divider,
    Button,
    Paper
} from '@mui/material';
import {
    RestartAlt as ResetIcon,
    Search as SearchIcon
} from '@mui/icons-material';
import { PREDEFINED_CERTIFICATIONS } from '@/constants/certifications';

// Define the shape of the advanced filters
export interface AdvancedFiltersState {
    cities: string[];
    certifications: string[];
    availability: {
        available24_7: boolean;
        availableDays: boolean;
        availableNights: boolean;
        availableWeekends: boolean;
        availableImmediately: boolean;
    };
    hasVehicle: boolean | null; // null = doesn't matter
    hasDriverLicense: boolean | null;
    minRating: number;
    languages: string[];
    skills: string[];
}

interface AdvancedFiltersPanelProps {
    filters: AdvancedFiltersState;
    onFilterChange: (newFilters: AdvancedFiltersState) => void;
    onReset: () => void;
    onSearch: () => void;
    citySuggestions: string[];
    onCityInputChange: (value: string) => void;
}

const LANGUAGES_LIST = ['Français', 'Anglais', 'Espagnol', 'Arabe', 'Mandarin', 'Autre'];

export default function AdvancedFiltersPanel({
    filters,
    onFilterChange,
    onReset,
    onSearch,
    citySuggestions,
    onCityInputChange
}: AdvancedFiltersPanelProps) {

    const handleAvailabilityChange = (field: keyof AdvancedFiltersState['availability']) => {
        onFilterChange({
            ...filters,
            availability: {
                ...filters.availability,
                [field]: !filters.availability[field]
            }
        });
    };

    const handleCheckboxChange = (field: keyof AdvancedFiltersState, value: any) => {
        onFilterChange({
            ...filters,
            [field]: value
        });
    };

    return (
        <Paper elevation={0} variant="outlined" sx={{ p: 3, bgcolor: 'grey.50' }}>
            <Grid container spacing={4}>
                {/* Colonne 1: Disponibilité & Transport */}
                <Grid item xs={12} md={3}>
                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom color="primary">
                        DISPONIBILITÉ & TRANSPORT
                    </Typography>

                    <FormControl component="fieldset" variant="standard" sx={{ mb: 2 }}>
                        <FormGroup>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={filters.availability.available24_7}
                                        onChange={() => handleAvailabilityChange('available24_7')}
                                        name="available24_7"
                                        size="small"
                                    />
                                }
                                label="Disponible 24/7"
                            />
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={filters.availability.availableImmediately}
                                        onChange={() => handleAvailabilityChange('availableImmediately')}
                                        name="availableImmediately"
                                        size="small"
                                    />
                                }
                                label="Disponible Immédiatement"
                            />
                            <Box mt={1} pl={1} borderLeft={1} borderColor="divider">
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={filters.availability.availableDays}
                                            onChange={() => handleAvailabilityChange('availableDays')}
                                            name="availableDays"
                                            size="small"
                                        />
                                    }
                                    label="Jour"
                                />
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={filters.availability.availableNights}
                                            onChange={() => handleAvailabilityChange('availableNights')}
                                            name="availableNights"
                                            size="small"
                                        />
                                    }
                                    label="Nuit"
                                />
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={filters.availability.availableWeekends}
                                            onChange={() => handleAvailabilityChange('availableWeekends')}
                                            name="availableWeekends"
                                            size="small"
                                        />
                                    }
                                    label="Fin de semaine"
                                />
                            </Box>
                        </FormGroup>
                    </FormControl>

                    <Divider sx={{ my: 1 }} />

                    <FormControl component="fieldset" variant="standard">
                        <FormGroup>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={filters.hasVehicle === true}
                                        onChange={(e) => handleCheckboxChange('hasVehicle', e.target.checked ? true : null)}
                                        size="small"
                                    />
                                }
                                label="Possède un véhicule"
                            />
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={filters.hasDriverLicense === true}
                                        onChange={(e) => handleCheckboxChange('hasDriverLicense', e.target.checked ? true : null)}
                                        size="small"
                                    />
                                }
                                label="Permis de conduire"
                            />
                        </FormGroup>
                    </FormControl>
                </Grid>

                {/* Colonne 2: Certifications & Compétences */}
                <Grid item xs={12} md={3}>
                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom color="primary">
                        CERTIFICATIONS
                    </Typography>

                    <Autocomplete
                        multiple
                        options={PREDEFINED_CERTIFICATIONS}
                        value={filters.certifications}
                        onChange={(_, newValue) => handleCheckboxChange('certifications', newValue)}
                        renderInput={(params) => (
                            <TextField {...params} variant="outlined" label="Certifications requises" placeholder="Sélectionner..." size="small" />
                        )}
                        renderTags={(value, getTagProps) =>
                            value.map((option, index) => (
                                <Chip variant="outlined" label={option} size="small" {...getTagProps({ index })} />
                            ))
                        }
                        sx={{ mb: 3 }}
                    />

                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom color="primary">
                        LANGUES
                    </Typography>
                    <Autocomplete
                        multiple
                        options={LANGUAGES_LIST}
                        value={filters.languages}
                        onChange={(_, newValue) => handleCheckboxChange('languages', newValue)}
                        renderInput={(params) => (
                            <TextField {...params} variant="outlined" label="Langues parlées" placeholder="Sélectionner..." size="small" />
                        )}
                        renderTags={(value, getTagProps) =>
                            value.map((option, index) => (
                                <Chip variant="outlined" label={option} size="small" {...getTagProps({ index })} />
                            ))
                        }
                    />
                </Grid>

                {/* Colonne 3: Localisation & Note */}
                <Grid item xs={12} md={3}>
                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom color="primary">
                        LOCALISATION
                    </Typography>

                    <Autocomplete
                        multiple
                        freeSolo
                        options={citySuggestions}
                        value={filters.cities}
                        onInputChange={(_, newValue) => onCityInputChange(newValue)}
                        onChange={(_, newValue) => handleCheckboxChange('cities', newValue)}
                        renderInput={(params) => (
                            <TextField {...params} variant="outlined" label="Villes" placeholder="Ajouter une ville..." size="small" />
                        )}
                        renderTags={(value, getTagProps) =>
                            value.map((option, index) => (
                                <Chip variant="outlined" label={option} size="small" {...getTagProps({ index })} />
                            ))
                        }
                        sx={{ mb: 3 }}
                    />

                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom color="primary">
                        NOTE MINIMALE
                    </Typography>
                    <Box px={1}>
                        <Slider
                            value={filters.minRating}
                            onChange={(_, newValue) => handleCheckboxChange('minRating', newValue as number)}
                            valueLabelDisplay="auto"
                            step={0.5}
                            marks
                            min={0}
                            max={10}
                            size="small"
                        />
                        <Typography variant="caption" color="text.secondary" align="center" display="block">
                            {filters.minRating > 0 ? `${filters.minRating}/10 et plus` : "Toutes les notes"}
                        </Typography>
                    </Box>
                </Grid>

                {/* Colonne 4: Actions */}
                <Grid item xs={12} md={3} display="flex" flexDirection="column" justifyContent="flex-end">
                    <Button
                        variant="contained"
                        color="primary"
                        startIcon={<SearchIcon />}
                        onClick={onSearch}
                        fullWidth
                        sx={{ mb: 2 }}
                    >
                        Appliquer les filtres
                    </Button>
                    <Button
                        variant="outlined"
                        color="inherit"
                        startIcon={<ResetIcon />}
                        onClick={onReset}
                        fullWidth
                    >
                        Réinitialiser
                    </Button>
                </Grid>
            </Grid>
        </Paper>
    );
}
