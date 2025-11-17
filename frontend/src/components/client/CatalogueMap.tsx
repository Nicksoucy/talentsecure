import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Circle, Popup } from 'react-leaflet';
import { Box, Typography, CircularProgress, Paper, Chip, Button } from '@mui/material';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { quebecCitiesCoordinates } from '../../utils/quebecCities';
import { useClientAuthStore } from '@/store/clientAuthStore';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

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

interface CatalogueMapProps {
  catalogueId: string;
  onCityClick?: (city: string, count: number) => void;
}

const CatalogueMap: React.FC<CatalogueMapProps> = ({ catalogueId, onCityClick }) => {
  const { accessToken } = useClientAuthStore();
  const [cityStats, setCityStats] = useState<CityStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCityStats = async () => {
      try {
        const response = await axios.get(
          `${API_URL}/api/client-auth/catalogues/${catalogueId}/stats/by-city`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
        setCityStats(response.data.data);
      } catch (err) {
        console.error('Error fetching city stats:', err);
        setError('Erreur lors du chargement des données');
      } finally {
        setLoading(false);
      }
    };

    if (catalogueId && accessToken) {
      fetchCityStats();
    }
  }, [catalogueId, accessToken]);

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

  if (cityStats.length === 0) {
    return (
      <Box p={3}>
        <Typography color="text.secondary">Aucune donnée géographique disponible</Typography>
      </Box>
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
            <Circle
              key={stat.city}
              center={[coords.lat, coords.lng]}
              radius={getMarkerRadius(stat.count)}
              pathOptions={{
                fillColor: getMarkerColor(stat.count),
                fillOpacity: 0.6,
                color: getMarkerColor(stat.count),
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
                    color="primary"
                    size="small"
                    sx={{ mb: 1 }}
                  />
                  {onCityClick && (
                    <Button
                      variant="contained"
                      size="small"
                      fullWidth
                      onClick={() => onCityClick(stat.city, stat.count)}
                      sx={{ mt: 1 }}
                    >
                      Demander ces candidats
                    </Button>
                  )}
                </Box>
              </Popup>
            </Circle>
          );
        })}
      </MapContainer>
    </Paper>
  );
};

export default CatalogueMap;
