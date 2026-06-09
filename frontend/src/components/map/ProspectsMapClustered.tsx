import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Box, Typography, CircularProgress, Paper, Chip, Button } from '@mui/material';
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

interface ProspectsMapClusteredProps {
  onCityClick?: (city: string) => void;
  /** Sélection par rayon : toutes les villes à ≤ radiusKm du centre. */
  onRadiusSelect?: (cities: string[], center: string, radiusKm: number) => void;
}

/** Distance en km entre deux coords (haversine). */
function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Pastille ronde par ville : taille + couleur selon le nombre de prospects.
const makeCityIcon = (count: number) => {
  let dimension = 36;
  let color = '#2196f3';
  if (count >= 100) {
    dimension = 56;
    color = '#1565c0';
  } else if (count >= 50) {
    dimension = 50;
    color = '#1976d2';
  } else if (count >= 20) {
    dimension = 44;
    color = '#42a5f5';
  } else if (count >= 5) {
    dimension = 40;
    color = '#64b5f6';
  }

  return L.divIcon({
    html: `<div style="background-color:${color};width:${dimension}px;height:${dimension}px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:13px;border:3px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);">${count}</div>`,
    className: 'custom-city-icon',
    iconSize: L.point(dimension, dimension, true),
    iconAnchor: [dimension / 2, dimension / 2],
    popupAnchor: [0, -dimension / 2],
  });
};

const ProspectsMapClustered: React.FC<ProspectsMapClusteredProps> = ({ onCityClick, onRadiusSelect }) => {
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

  // Une ville placée = a des coordonnées ; sinon en attente de géolocalisation.
  const placed = cityStats.filter((s) => s.lat != null && s.lng != null);
  const unplaced = cityStats.filter((s) => s.lat == null || s.lng == null);
  const unplacedProspects = unplaced.reduce((sum, s) => sum + s.count, 0);

  // Sélectionne toutes les villes placées à ≤ radiusKm du centre (inclus).
  const handleRadius = (centerStat: CityStats, radiusKm: number) => {
    const center: [number, number] = [centerStat.lat as number, centerStat.lng as number];
    const cities = placed
      .filter((s) => distanceKm(center, [s.lat as number, s.lng as number]) <= radiusKm)
      .map((s) => s.city);
    onRadiusSelect?.(cities, centerStat.city, radiusKm);
  };

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
            <Marker
              key={stat.city}
              position={[stat.lat as number, stat.lng as number]}
              icon={makeCityIcon(stat.count)}
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
                  {onRadiusSelect && (
                    <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid #eee' }}>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                        Sélectionner les villes autour (km) :
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {[10, 25, 50, 100].map((km) => (
                          <Button
                            key={km}
                            size="small"
                            variant="outlined"
                            sx={{ minWidth: 0, px: 1 }}
                            onClick={() => handleRadius(stat, km)}
                          >
                            {km}
                          </Button>
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </Paper>

      {unplaced.length > 0 && (
        <Box sx={{ mt: 1, px: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {unplaced.length} ville{unplaced.length > 1 ? 's' : ''} non encore géolocalisée
            {unplaced.length > 1 ? 's' : ''} ({unplacedProspects} prospect
            {unplacedProspects > 1 ? 's' : ''}) — localisation automatique en cours, réessayez
            dans un instant : {unplaced.slice(0, 15).map((s) => `${s.city} (${s.count})`).join(', ')}
            {unplaced.length > 15 ? '…' : ''}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ProspectsMapClustered;
