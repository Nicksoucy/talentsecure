import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { Box, Typography, CircularProgress, Paper, Button, Chip } from '@mui/material';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { quebecCitiesCoordinates } from '../../utils/quebecCities';
import api from '../../services/api';

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

interface CandidatesMapProps {
  onCityClick?: (city: string) => void;
}

const CandidatesMap: React.FC<CandidatesMapProps> = ({ onCityClick }) => {
  const [cityStats, setCityStats] = useState<CityStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCityStats = async () => {
      try {
        const response = await api.get('/api/candidates/stats/by-city');
        const rawStats: CityStats[] = response.data.data;

        // Aggregate stats by coordinates to avoid overlapping circles
        const aggregatedStatsMap = new Map<string, CityStats>();

        rawStats.forEach(stat => {
          // Normalize city name to match keys in quebecCitiesCoordinates
          // Try exact match first, then case-insensitive, then normalized
          let coords = quebecCitiesCoordinates[stat.city];

          if (!coords) {
            // Try to find a match ignoring case and accents
            const normalizedCity = stat.city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const match = Object.keys(quebecCitiesCoordinates).find(key =>
              key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === normalizedCity
            );
            if (match) {
              coords = quebecCitiesCoordinates[match];
            }
          }

          if (coords) {
            const key = `${coords.lat},${coords.lng}`;
            const existing = aggregatedStatsMap.get(key);
            if (existing) {
              existing.count += stat.count;
              // Keep the name that matches the coordinates key if possible, or the longest one
              if (!quebecCitiesCoordinates[existing.city] && quebecCitiesCoordinates[stat.city]) {
                existing.city = stat.city;
              }
            } else {
              aggregatedStatsMap.set(key, { ...stat });
            }
          } else {
            // If no coordinates found, keep it as is (it won't be rendered but good for debugging)
            // Or we could try to map it to "Autre"
          }
        });

        setCityStats(Array.from(aggregatedStatsMap.values()));
      } catch (err) {
        console.error('Error fetching city stats:', err);
        setError('Erreur lors du chargement des données');
      } finally {
        setLoading(false);
      }
    };

    fetchCityStats();
  }, []);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  // Quebec center coordinates
  const quebecCenter: [number, number] = [46.8, -71.3];

  // Function to get marker size in PIXELS based on candidate count
  const getMarkerRadius = (count: number): number => {
    if (count >= 20) return 25;
    if (count >= 10) return 20;
    if (count >= 5) return 15;
    return 10;
  };

  // Function to get color based on candidate count
  const getMarkerColor = (count: number): string => {
    if (count >= 20) return '#d32f2f'; // Dark red
    if (count >= 10) return '#f57c00'; // Orange
    if (count >= 5) return '#fbc02d';  // Yellow
    return '#388e3c'; // Green
  };

  return (
    <Paper elevation={2} sx={{ height: '500px', overflow: 'hidden' }}>
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

        {cityStats.map((stat) => {
          const coords = quebecCitiesCoordinates[stat.city];
          if (!coords) return null;

          return (
            <CircleMarker
              key={stat.city}
              center={[coords.lat, coords.lng]}
              radius={getMarkerRadius(stat.count)}
              pathOptions={{
                fillColor: getMarkerColor(stat.count),
                fillOpacity: 0.7,
                color: 'white',
                weight: 2,
              }}
            >
              <Popup>
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                    {stat.city}
                  </Typography>
                  <Chip
                    label={`${stat.count} candidat${stat.count > 1 ? 's' : ''}`}
                    color="success"
                    size="small"
                    sx={{ mb: 1 }}
                  />
                  {onCityClick && (
                    <Button
                      variant="contained"
                      size="small"
                      fullWidth
                      onClick={() => onCityClick(stat.city)}
                    >
                      Voir ces candidats
                    </Button>
                  )}
                </Box>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </Paper>
  );
};

export default CandidatesMap;
