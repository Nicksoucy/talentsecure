import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { Box, Typography, CircularProgress, Paper } from '@mui/material';
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

const ProspectsMap: React.FC = () => {
  const [cityStats, setCityStats] = useState<CityStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCityStats = async () => {
      try {
        const response = await api.get('/api/prospects/stats/by-city');
        const rawStats: CityStats[] = response.data.data;

        // Aggregate stats by coordinates to avoid overlapping circles
        const aggregatedStatsMap = new Map<string, CityStats>();

        rawStats.forEach(stat => {
          // Normalize city name to match keys in quebecCitiesCoordinates
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
          }
        });

        setCityStats(Array.from(aggregatedStatsMap.values()));
      } catch (err) {
        console.error('Error fetching prospect city stats:', err);
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

  // Function to get marker size in PIXELS based on prospect count
  const getMarkerRadius = (count: number): number => {
    if (count >= 50) return 30;
    if (count >= 20) return 25;
    if (count >= 10) return 20;
    if (count >= 5) return 15;
    return 10;
  };

  // Function to get color based on prospect count (using blue tones for prospects)
  const getMarkerColor = (count: number): string => {
    if (count >= 50) return '#1565c0'; // Dark blue
    if (count >= 20) return '#1976d2'; // Medium blue
    if (count >= 10) return '#42a5f5'; // Light blue
    if (count >= 5) return '#64b5f6';  // Lighter blue
    return '#90caf9'; // Very light blue
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
                  <Typography variant="h6" gutterBottom>
                    {stat.city}
                  </Typography>
                  <Typography variant="body1">
                    <strong>{stat.count}</strong> prospect{stat.count > 1 ? 's' : ''}
                  </Typography>
                </Box>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </Paper>
  );
};

export default ProspectsMap;
