import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { Box, Typography, CircularProgress, Paper, Chip, Button } from '@mui/material';
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
  onCityClick?: (city: string) => void;
}

const ProspectsMapClustered: React.FC<ProspectsMapClusteredProps> = ({ onCityClick }) => {
  const [cityStats, setCityStats] = useState<CityStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCityStats = async () => {
      try {
        const response = await api.get('/api/prospects/stats/by-city');
        setCityStats(response.data.data);
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

  // Create markers for each prospect in the city (spread around the city center)
  const createMarkers = () => {
    const markers: JSX.Element[] = [];

    cityStats.forEach((stat) => {
      const coords = quebecCitiesCoordinates[stat.city];
      if (!coords) return;

      // Create multiple markers for each prospect in the city
      // Spread them slightly around the city center for better clustering visualization
      for (let i = 0; i < stat.count; i++) {
        // Add small random offset (about 0.01 degrees = ~1km)
        const latOffset = (Math.random() - 0.5) * 0.02;
        const lngOffset = (Math.random() - 0.5) * 0.02;

        markers.push(
          <Marker
            key={`${stat.city}-${i}`}
            position={[coords.lat + latOffset, coords.lng + lngOffset]}
            icon={blueIcon}
          >
            <Popup>
              <Box>
                <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                  {stat.city}
                </Typography>
                <Chip
                  label={`${stat.count} prospect${stat.count > 1 ? 's' : ''}`}
                  color="primary"
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
                    Voir ces prospects
                  </Button>
                )}
              </Box>
            </Popup>
          </Marker>
        );
      }
    });

    return markers;
  };

  return (
    <Paper elevation={2} sx={{ height: '500px', overflow: 'hidden' }}>
      <MapContainer
        center={quebecCenter}
        zoom={7}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={60}
          spiderfyOnMaxZoom={true}
          showCoverageOnHover={false}
          zoomToBoundsOnClick={true}
          iconCreateFunction={(cluster) => {
            const count = cluster.getChildCount();
            let size = 'small';
            let color = '#2196f3';

            if (count >= 100) {
              size = 'large';
              color = '#1565c0';
            } else if (count >= 50) {
              size = 'medium';
              color = '#1976d2';
            } else if (count >= 20) {
              size = 'medium';
              color = '#42a5f5';
            }

            const sizeMap = {
              small: 40,
              medium: 50,
              large: 60,
            };

            const dimension = sizeMap[size as keyof typeof sizeMap];

            return L.divIcon({
              html: `<div style="background-color: ${color}; width: ${dimension}px; height: ${dimension}px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">${count}</div>`,
              className: 'custom-cluster-icon',
              iconSize: L.point(dimension, dimension, true),
            });
          }}
        >
          {createMarkers()}
        </MarkerClusterGroup>
      </MapContainer>
    </Paper>
  );
};

export default ProspectsMapClustered;
