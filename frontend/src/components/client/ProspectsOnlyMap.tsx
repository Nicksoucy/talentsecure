import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Circle, Popup } from 'react-leaflet';
import { Box, Typography, CircularProgress, Paper, Chip, Button } from '@mui/material';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { quebecCitiesCoordinates } from '../../utils/quebecCities';
import { useClientAuthStore } from '@/store/clientAuthStore';
import clientApi from '@/services/clientApi';

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

interface ProspectsOnlyMapProps {
  onCityClick?: (city: string, count: number) => void;
}

const ProspectsOnlyMap: React.FC<ProspectsOnlyMapProps> = ({ onCityClick }) => {
  const { accessToken } = useClientAuthStore();
  const [cityStats, setCityStats] = useState<CityStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCityStats = async () => {
      try {
        const response = await clientApi.get('/api/client-auth/prospects-only/stats/by-city');
        setCityStats(response.data.data);
      } catch (err) {
        console.error('Error fetching prospects-only city stats:', err);
        setError('Erreur lors du chargement des données');
      } finally {
        setLoading(false);
      }
    };

    if (accessToken) {
      fetchCityStats();
    }
  }, [accessToken]);

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

  // Function to get marker size based on prospect count
  const getMarkerRadius = (count: number): number => {
    if (count >= 20) return 25000;
    if (count >= 10) return 15000;
    if (count >= 5) return 10000;
    return 7000;
  };

  // Function to get color based on prospect count - Orange theme for prospects
  const getMarkerColor = (count: number): string => {
    if (count >= 20) return '#ff6f00'; // Dark orange
    if (count >= 10) return '#ff9100'; // Medium orange
    if (count >= 5) return '#ffa726';  // Light orange
    return '#ffb74d'; // Very light orange
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
                    label={`${stat.count} CV${stat.count > 1 ? 's' : ''} disponible${stat.count > 1 ? 's' : ''}`}
                    color="warning"
                    size="small"
                    sx={{ mb: 1 }}
                  />
                  <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 1 }}>
                    CVs seulement - Entrevue à faire
                  </Typography>
                  <Typography variant="caption" display="block" fontWeight="bold" color="success.main" sx={{ mb: 1 }}>
                    💰 5-10$ par CV
                  </Typography>
                  {onCityClick && (
                    <Button
                      variant="contained"
                      size="small"
                      fullWidth
                      color="warning"
                      onClick={() => onCityClick(stat.city, stat.count)}
                      sx={{ mt: 1 }}
                    >
                      Demander CVs
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

export default ProspectsOnlyMap;
