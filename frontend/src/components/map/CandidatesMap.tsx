import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { Box, Typography, CircularProgress, Paper, Button, Chip } from '@mui/material';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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
  lat: number | null;
  lng: number | null;
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
        setCityStats(response.data.data);
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

  // Une ville placée = a des coordonnées ; sinon en attente de géolocalisation.
  const placed = cityStats.filter((s) => s.lat != null && s.lng != null);
  const unplaced = cityStats.filter((s) => s.lat == null || s.lng == null);
  const unplacedCandidates = unplaced.reduce((sum, s) => sum + s.count, 0);

  return (
    <Box>
      <Paper elevation={2} sx={{ height: '500px', overflow: 'hidden' }}>
        <MapContainer
          center={quebecCenter}
          zoom={6}
          maxZoom={16}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />

          {placed.map((stat) => (
            <CircleMarker
              key={stat.city}
              center={[stat.lat as number, stat.lng as number]}
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
          ))}
        </MapContainer>
      </Paper>

      {unplaced.length > 0 && (
        <Box sx={{ mt: 1, px: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {unplaced.length} ville{unplaced.length > 1 ? 's' : ''} non encore géolocalisée
            {unplaced.length > 1 ? 's' : ''} ({unplacedCandidates} candidat
            {unplacedCandidates > 1 ? 's' : ''}) — localisation automatique en cours, réessayez
            dans un instant : {unplaced.slice(0, 15).map((s) => `${s.city} (${s.count})`).join(', ')}
            {unplaced.length > 15 ? '…' : ''}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default CandidatesMap;
