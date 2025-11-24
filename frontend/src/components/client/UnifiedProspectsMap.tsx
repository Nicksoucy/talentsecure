import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Circle, Tooltip } from 'react-leaflet';
import {
    Box,
    Typography,
    CircularProgress,
    Paper,
    ToggleButtonGroup,
    ToggleButton,
    TextField,
    InputAdornment,
    Chip,
    Stack,
    Alert,
} from '@mui/material';
import {
    Search as SearchIcon,
    Person as PersonIcon,
    CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { quebecCitiesCoordinates } from '../../utils/quebecCities';
import { useClientAuthStore } from '@/store/clientAuthStore';
import clientApi from '@/services/clientApi';
import { CandidateTypeTooltips } from './InfoTooltip';

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface CityStats {
    city: string;
    count: number;
}

interface UnifiedProspectsMapProps {
    onCityClick?: (city: string, count: number) => void;
}

type MapMode = 'evaluated' | 'cvonly';

const UnifiedProspectsMap: React.FC<UnifiedProspectsMapProps> = ({ onCityClick }) => {
    const { accessToken } = useClientAuthStore();
    const [evaluatedStats, setEvaluatedStats] = useState<CityStats[]>([]);
    const [cvOnlyStats, setCvOnlyStats] = useState<CityStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mapMode, setMapMode] = useState<MapMode>('evaluated');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setLoading(true);
                const [evaluatedResponse, cvOnlyResponse] = await Promise.all([
                    clientApi.get('/api/client-auth/prospects/stats/by-city'),
                    clientApi.get('/api/client-auth/prospects-only/stats/by-city'),
                ]);
                setEvaluatedStats(evaluatedResponse.data.data);
                setCvOnlyStats(cvOnlyResponse.data.data);
            } catch (err) {
                console.error('Error fetching city stats:', err);
                setError('Erreur lors du chargement des données');
            } finally {
                setLoading(false);
            }
        };

        if (accessToken) {
            fetchStats();
        }
    }, [accessToken]);

    // Get current stats based on mode
    const currentStats = mapMode === 'evaluated' ? evaluatedStats : cvOnlyStats;

    // Filter cities based on search query
    const filteredStats = useMemo(() => {
        if (!searchQuery.trim()) return currentStats;
        const query = searchQuery.toLowerCase();
        return currentStats.filter((stat) =>
            stat.city.toLowerCase().includes(query)
        );
    }, [currentStats, searchQuery]);

    // Calculate total candidates
    const totalCandidates = useMemo(() => {
        return filteredStats.reduce((sum, stat) => sum + stat.count, 0);
    }, [filteredStats]);

    const handleModeChange = (_event: React.MouseEvent<HTMLElement>, newMode: MapMode | null) => {
        if (newMode !== null) {
            setMapMode(newMode);
            setSearchQuery(''); // Clear search when switching modes
        }
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height="500px">
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return (
            <Alert severity="error" sx={{ mb: 2 }}>
                {error}
            </Alert>
        );
    }

    if (currentStats.length === 0) {
        return (
            <Alert severity="info" sx={{ mb: 2 }}>
                Aucune donnée géographique disponible pour ce type de candidat
            </Alert>
        );
    }

    // Quebec center coordinates
    const quebecCenter: [number, number] = [46.8, -71.3];

    // Function to get marker size based on candidate count
    const getMarkerRadius = (count: number): number => {
        if (count >= 20) return 25000;
        if (count >= 10) return 15000;
        if (count >= 5) return 10000;
        return 7000;
    };

    // Function to get color based on mode and count
    const getMarkerColor = (count: number): string => {
        if (mapMode === 'evaluated') {
            // Blue shades for evaluated candidates (premium)
            if (count >= 20) return '#1565c0'; // Dark blue
            if (count >= 10) return '#1976d2'; // Blue
            if (count >= 5) return '#42a5f5';  // Light blue
            return '#64b5f6'; // Very light blue
        } else {
            // Orange shades for CV-only (economy)
            if (count >= 20) return '#e65100'; // Dark orange
            if (count >= 10) return '#f57c00'; // Orange
            if (count >= 5) return '#ff9800';  // Light orange
            return '#ffb74d'; // Very light orange
        }
    };

    return (
        <Box>
            {/* Controls Section */}
            <Paper elevation={2} sx={{ p: 1.5, mb: 1.5 }}>
                <Stack spacing={1.5}>
                    {/* Toggle between modes */}
                    <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
                        <ToggleButtonGroup
                            value={mapMode}
                            exclusive
                            onChange={handleModeChange}
                            aria-label="type de candidat"
                            size="small"
                        >
                            <ToggleButton value="evaluated" aria-label="candidats évalués">
                                <CheckCircleIcon sx={{ mr: 0.5, fontSize: '1.1rem' }} />
                                <Typography variant="body2">Candidats Évalués</Typography>
                            </ToggleButton>
                            <ToggleButton value="cvonly" aria-label="cvs seulement">
                                <PersonIcon sx={{ mr: 0.5, fontSize: '1.1rem' }} />
                                <Typography variant="body2">CVs Seulement</Typography>
                            </ToggleButton>
                        </ToggleButtonGroup>

                        <Chip
                            label={`${totalCandidates} candidat${totalCandidates !== 1 ? 's' : ''} ${searchQuery ? 'trouvé' + (totalCandidates !== 1 ? 's' : '') : 'disponible' + (totalCandidates !== 1 ? 's' : '')}`}
                            color={mapMode === 'evaluated' ? 'primary' : 'warning'}
                            variant="outlined"
                            size="small"
                        />
                    </Box>

                    {/* Search bar */}
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Rechercher une ville (ex: Montréal, Québec, Laval...)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon fontSize="small" />
                                </InputAdornment>
                            ),
                        }}
                    />

                    {/* Pricing info with tooltip */}
                    <Alert
                        severity={mapMode === 'evaluated' ? 'success' : 'warning'}
                        icon={mapMode === 'evaluated' ? <CheckCircleIcon /> : <PersonIcon />}
                        sx={{ py: 0.5 }}
                    >
                        <Box display="flex" alignItems="center" gap={0.5}>
                            <Typography variant="body2">
                                <strong>
                                    {mapMode === 'evaluated'
                                        ? 'Premium 15-45$ par candidat'
                                        : 'Économique 5-10$ par CV'}
                                </strong>
                                {' - '}
                                {mapMode === 'evaluated'
                                    ? 'Avec vidéo d\'entrevue, évaluations complètes et notes RH'
                                    : 'CVs uniquement, entrevue à votre charge. Parfait pour économiser!'}
                            </Typography>
                            {mapMode === 'evaluated' ? CandidateTypeTooltips.evaluated : CandidateTypeTooltips.cvOnly}
                        </Box>
                    </Alert>
                </Stack>
            </Paper>

            {/* Map */}
            <Paper elevation={2} sx={{ height: '400px', overflow: 'hidden' }}>
                <MapContainer
                    center={quebecCenter}
                    zoom={6}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={true}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />

                    {filteredStats.map((stat) => {
                        const coords = quebecCitiesCoordinates[stat.city];
                        if (!coords) return null;

                        return (
                            <Circle
                                key={stat.city}
                                center={coords}
                                radius={getMarkerRadius(stat.count)}
                                pathOptions={{
                                    color: getMarkerColor(stat.count),
                                    fillColor: getMarkerColor(stat.count),
                                    fillOpacity: 0.5,
                                    weight: 2,
                                }}
                                eventHandlers={{
                                    click: () => {
                                        if (onCityClick) {
                                            onCityClick(stat.city, stat.count);
                                        }
                                    },
                                }}
                            >
                                {/* Tooltip shows on hover */}
                                <Tooltip permanent={false} direction="top" offset={[0, -10]}>
                                    <Box sx={{ textAlign: 'center' }}>
                                        <Typography variant="subtitle2" fontWeight="bold">
                                            {stat.city}
                                        </Typography>
                                        <Typography variant="caption">
                                            {stat.count} candidat{stat.count !== 1 ? 's' : ''}
                                        </Typography>
                                        <Typography variant="caption" display="block" sx={{ fontStyle: 'italic', mt: 0.5 }}>
                                            Cliquez pour demander
                                        </Typography>
                                    </Box>
                                </Tooltip>
                            </Circle>
                        );
                    })}
                </MapContainer>
            </Paper>

            {/* Legend */}
            <Paper elevation={1} sx={{ p: 1.5, mt: 1.5 }}>
                <Typography variant="caption" fontWeight="bold" display="block" gutterBottom>
                    Légende
                </Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                    <Box display="flex" alignItems="center" gap={0.5}>
                        <Box
                            sx={{
                                width: 16,
                                height: 16,
                                borderRadius: '50%',
                                bgcolor: getMarkerColor(25),
                                border: '2px solid',
                                borderColor: getMarkerColor(25),
                            }}
                        />
                        <Typography variant="caption">20+ candidats</Typography>
                    </Box>
                    <Box display="flex" alignItems="center" gap={0.5}>
                        <Box
                            sx={{
                                width: 14,
                                height: 14,
                                borderRadius: '50%',
                                bgcolor: getMarkerColor(15),
                                border: '2px solid',
                                borderColor: getMarkerColor(15),
                            }}
                        />
                        <Typography variant="caption">10-19 candidats</Typography>
                    </Box>
                    <Box display="flex" alignItems="center" gap={0.5}>
                        <Box
                            sx={{
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                bgcolor: getMarkerColor(7),
                                border: '2px solid',
                                borderColor: getMarkerColor(7),
                            }}
                        />
                        <Typography variant="caption">5-9 candidats</Typography>
                    </Box>
                    <Box display="flex" alignItems="center" gap={0.5}>
                        <Box
                            sx={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                bgcolor: getMarkerColor(2),
                                border: '2px solid',
                                borderColor: getMarkerColor(2),
                            }}
                        />
                        <Typography variant="caption">1-4 candidats</Typography>
                    </Box>
                </Stack>
            </Paper>
        </Box >
    );
};

export default UnifiedProspectsMap;
