import { useState } from 'react';
import {
    Paper,
    InputBase,
    IconButton,
    Box,
    Typography,
    CircularProgress,
    Collapse,
    Chip,
    useTheme,
    alpha,
} from '@mui/material';
import {
    AutoAwesome as AutoAwesomeIcon,
    Search as SearchIcon,
    Close as CloseIcon,
} from '@mui/icons-material';
import { candidateService, AdvancedSearchParams } from '@/services/candidate.service';
import { useSnackbar } from 'notistack';

interface SmartSearchBarProps {
    onSearch: (filters: AdvancedSearchParams) => void;
    onClear: () => void;
}

export default function SmartSearchBar({ onSearch, onClear }: SmartSearchBarProps) {
    const theme = useTheme();
    const { enqueueSnackbar } = useSnackbar();
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeFilters, setActiveFilters] = useState<AdvancedSearchParams | null>(null);

    const handleSearch = async () => {
        if (!query.trim()) return;

        setLoading(true);
        try {
            const response = await candidateService.parseNaturalLanguageQuery(query);
            if (response.success && response.data) {
                setActiveFilters(response.data);
                onSearch(response.data);
                enqueueSnackbar('Filtres appliqués avec succès', { variant: 'success' });
            }
        } catch (error) {
            console.error('Smart search error:', error);
            enqueueSnackbar('Impossible de comprendre la recherche. Essayez des termes plus simples.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    const handleClear = () => {
        setQuery('');
        setActiveFilters(null);
        onClear();
    };

    const renderActiveFilters = () => {
        if (!activeFilters) return null;

        const chips: React.ReactNode[] = [];

        if (activeFilters.cities?.length) {
            chips.push(
                <Chip
                    key="cities"
                    label={`Villes: ${activeFilters.cities.join(', ')}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                />
            );
        }

        if (activeFilters.certifications?.length) {
            chips.push(
                <Chip
                    key="certs"
                    label={`Certifications: ${activeFilters.certifications.join(', ')}`}
                    size="small"
                    color="secondary"
                    variant="outlined"
                />
            );
        }

        if (activeFilters.availability?.length) {
            chips.push(
                <Chip
                    key="avail"
                    label={`Dispo: ${activeFilters.availability.join(', ')}`}
                    size="small"
                    color="info"
                    variant="outlined"
                />
            );
        }

        if (activeFilters.minRating) {
            chips.push(
                <Chip
                    key="rating"
                    label={`Note min: ${activeFilters.minRating}/10`}
                    size="small"
                    color="warning"
                    variant="outlined"
                />
            );
        }

        if (activeFilters.hasVehicle) {
            chips.push(
                <Chip
                    key="vehicle"
                    label="Avec véhicule"
                    size="small"
                    color="success"
                    variant="outlined"
                />
            );
        }

        if (activeFilters.skills?.length) {
            chips.push(
                <Chip
                    key="skills"
                    label={`Compétences: ${activeFilters.skills.join(', ')}`}
                    size="small"
                    color="default"
                    variant="outlined"
                />
            );
        }

        if (chips.length === 0) return null;

        return (
            <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
                    Filtres détectés:
                </Typography>
                {chips}
            </Box>
        );
    };

    return (
        <Box sx={{ mb: 3 }}>
            <Paper
                elevation={0}
                sx={{
                    p: '2px 4px',
                    display: 'flex',
                    alignItems: 'center',
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 2,
                    transition: 'all 0.2s',
                    '&:focus-within': {
                        borderColor: theme.palette.primary.main,
                        boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}`,
                    },
                }}
            >
                <IconButton sx={{ p: '10px' }} aria-label="ai-search">
                    <AutoAwesomeIcon color="primary" />
                </IconButton>
                <InputBase
                    sx={{ ml: 1, flex: 1 }}
                    placeholder='Recherche intelligente (ex: "Agent 24/7 à Montréal avec permis et BSP")'
                    inputProps={{ 'aria-label': 'smart search' }}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                />
                {loading ? (
                    <CircularProgress size={24} sx={{ m: 1 }} />
                ) : (
                    <>
                        {query && (
                            <IconButton sx={{ p: '10px' }} aria-label="clear" onClick={handleClear}>
                                <CloseIcon />
                            </IconButton>
                        )}
                        <IconButton
                            sx={{ p: '10px' }}
                            aria-label="search"
                            onClick={handleSearch}
                            color={query ? 'primary' : 'default'}
                        >
                            <SearchIcon />
                        </IconButton>
                    </>
                )}
            </Paper>
            <Collapse in={!!activeFilters}>
                {renderActiveFilters()}
            </Collapse>
        </Box>
    );
}
