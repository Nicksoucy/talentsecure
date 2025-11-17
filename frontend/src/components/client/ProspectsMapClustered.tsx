import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
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

// Custom blue icon for prospects
const blueIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface CityStats {
  city: string;
  count: number;
}

interface ProspectsMapClusteredProps {
  onCityClick?: (city: string, count: number) => void;
}

const ProspectsMapClustered: React.FC<ProspectsMapClusteredProps> = ({ onCityClick }) => {
  const { accessToken } = useClientAuthStore();
  const [cityStats, setCityStats] = useState<CityStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCityStats = async () => {
      try {
        const response = await axios.get(
          `${API_URL}/api/client-auth/prospects/stats/by-city`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
        setCityStats(response.data.data);
      } catch (err) {
        console.error('Error fetching prospects city stats:', err);
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

        <MarkerClusterGroup>
          {cityStats.map((stat) => {
            const coords = quebecCitiesCoordinates[stat.city];
            if (!coords) return null;

            return (
              <Marker
                key={stat.city}
                position={[coords.lat, coords.lng]}
                icon={blueIcon}
              >
                <Popup>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                      {stat.city}
                    </Typography>
                    <Chip
                      label={`${stat.count} candidat${stat.count > 1 ? 's' : ''} potentiel${stat.count > 1 ? 's' : ''}`}
                      color="info"
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
                        Demander des candidats
                      </Button>
                    )}
                  </Box>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>
    </Paper>
  );
};

export default ProspectsMapClustered;
