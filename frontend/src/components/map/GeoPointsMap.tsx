import React, { useEffect, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import {
  Box,
  Typography,
  CircularProgress,
  Paper,
  Chip,
  Button,
  TextField,
  Stack,
  Slider,
} from '@mui/material';
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

/**
 * Un point = toutes les personnes partageant les mêmes coordonnées : adresse
 * exacte (source 'address' — carte des agents), centroïde du secteur postal
 * (FSA, source 'postal') ou centre-ville (source 'city' = pas de code postal,
 * position approximative).
 */
interface MapPoint {
  lat: number;
  lng: number;
  count: number;
  source: string; // 'address' | 'postal' | 'city'
  label: string;
}

export interface GeoPointsMapProps {
  /** Endpoint des points (ex. /api/prospects/stats/map-points). */
  pointsUrl: string;
  /** Endpoint liste pour le compteur dans le rayon (ex. /api/prospects). */
  listUrl: string;
  /** Unité affichée : ['CV', 'CV'] ou ['candidat', 'candidats']. */
  unitSingular: string;
  unitPlural: string;
  /**
   * Recherche par rayon autour d'un POINT (déposé, recherché, ou un point de
   * la carte via « Voir ces … »). `label` décrit le point pour le message.
   */
  onNearbySelect?: (
    center: { lat: number; lng: number },
    radiusKm: number,
    label?: string
  ) => void;
}

// Pastille ronde : taille + couleur selon le nombre de personnes. Les points
// « centre-ville approx. » (sans code postal) sont orange, et ceux placés à
// l'adresse exacte (carte des agents) sont verts, pour les distinguer.
const makeCountIcon = (count: number, source: string = 'postal') => {
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
  if (source === 'city') color = '#fb8c00'; // position approximative (centre-ville)
  if (source === 'address') color = '#2e7d32'; // adresse exacte (précision rue)

  return L.divIcon({
    html: `<div style="background-color:${color};width:${dimension}px;height:${dimension}px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:13px;border:3px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);">${count}</div>`,
    className: 'custom-city-icon',
    iconSize: L.point(dimension, dimension, true),
    iconAnchor: [dimension / 2, dimension / 2],
    popupAnchor: [0, -dimension / 2],
  });
};

// Icône d'un cluster : somme des personnes des points regroupés (pas le nombre
// de points). Le count de chaque marqueur voyage via l'option `prospectCount`.
const clusterIcon = (cluster: any) => {
  const total = cluster
    .getAllChildMarkers()
    .reduce((sum: number, m: any) => sum + (Number(m.options?.prospectCount) || 1), 0);
  return makeCountIcon(total);
};

// Pastille distincte du point déposé/recherché (centre du rayon).
const dropIcon = L.divIcon({
  html: `<div style="width:20px;height:20px;border-radius:50%;background:#e53935;border:3px solid white;box-shadow:0 0 0 2px #e53935,0 2px 6px rgba(0,0,0,0.4);"></div>`,
  className: 'ts-drop-pin',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

/** Rayon « point exact » pour Voir ces personnes (le secteur cliqué). */
const SECTOR_RADIUS_KM = 0.05;

/** Capte les clics sur la carte pour déposer/déplacer le point. */
function ClickToPlace({ onPlace }: { onPlace: (p: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      onPlace([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

/** Expose l'instance Leaflet au parent (pour recentrer après une recherche). */
function MapRefSetter({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);
  return null;
}

const GeoPointsMap: React.FC<GeoPointsMapProps> = ({
  pointsUrl,
  listUrl,
  unitSingular,
  unitPlural,
  onNearbySelect,
}) => {
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [unplaced, setUnplaced] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Recherche par point + rayon.
  const mapRef = useRef<L.Map | null>(null);
  const [dropPoint, setDropPoint] = useState<[number, number] | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [searchQ, setSearchQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [nearCount, setNearCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  const unitFor = (n: number) => (n > 1 ? unitPlural : unitSingular);

  useEffect(() => {
    const fetchPoints = async () => {
      try {
        const response = await api.get(pointsUrl);
        setPoints(response.data.data.points);
        setUnplaced(response.data.data.unplaced ?? 0);
      } catch (err) {
        console.error('Error fetching map points:', err);
        setError('Erreur lors du chargement des données');
      } finally {
        setLoading(false);
      }
    };

    fetchPoints();
  }, [pointsUrl]);

  // Compteur dans le rayon (aperçu) : recalculé au changement point/rayon.
  // Debounce : le slider émet en continu pendant le glissement — on n'appelle
  // l'API qu'une fois la valeur stabilisée (le cercle, lui, suit en direct).
  useEffect(() => {
    if (!dropPoint) {
      setNearCount(null);
      return;
    }
    let cancelled = false;
    setCountLoading(true);
    const timer = setTimeout(() => {
      api
        .get(listUrl, {
          params: {
            nearLat: dropPoint[0],
            nearLng: dropPoint[1],
            nearRadiusKm: radiusKm,
            page: 1,
            limit: 1,
          },
        })
        .then((r) => {
          if (!cancelled) setNearCount(r.data.pagination?.total ?? 0);
        })
        .catch(() => {
          if (!cancelled) setNearCount(null);
        })
        .finally(() => {
          if (!cancelled) setCountLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dropPoint, radiusKm, listUrl]);

  const handleSearch = async () => {
    const q = searchQ.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await api.get('/api/geo/resolve', { params: { q } });
      const { lat, lng } = res.data.data;
      setDropPoint([lat, lng]);
      mapRef.current?.setView([lat, lng], 11);
    } catch {
      setSearchError('Introuvable au Québec (code postal ou ville).');
    } finally {
      setSearching(false);
    }
  };

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

  return (
    <Box>
      {/* Contrôles : recherche par code postal/ville + rayon autour d'un point */}
      <Paper elevation={1} sx={{ p: 1.5, mb: 1.5 }}>
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <TextField
              size="small"
              fullWidth
              placeholder="Code postal (ex : H2X 1Y4) ou ville…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              error={!!searchError}
              helperText={searchError || ' '}
            />
            <Button variant="contained" onClick={handleSearch} disabled={searching} sx={{ mt: 0 }}>
              {searching ? '…' : 'Localiser'}
            </Button>
          </Stack>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            justifyContent="space-between"
          >
            <Typography variant="caption" color="text.secondary">
              {dropPoint
                ? `Point déposé — ajustez le rayon puis trouvez les ${unitPlural} proches.`
                : 'Cliquez sur la carte pour déposer un point, ou cherchez un code postal.'}
            </Typography>
            <Stack
              direction="row"
              spacing={1.5}
              alignItems="center"
              sx={{ minWidth: { xs: '100%', sm: 280 }, pr: 1 }}
            >
              <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
                Rayon : <strong>{radiusKm} km</strong>
              </Typography>
              <Slider
                size="small"
                value={radiusKm}
                onChange={(_, v) => setRadiusKm(v as number)}
                min={1}
                max={100}
                step={1}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v} km`}
                marks={[
                  { value: 1 },
                  { value: 10 },
                  { value: 25 },
                  { value: 50 },
                  { value: 75 },
                  { value: 100 },
                ]}
                sx={{ flex: 1, minWidth: 160 }}
              />
            </Stack>
          </Stack>

          {dropPoint && (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              {onNearbySelect && (
                <Button
                  variant="contained"
                  color="primary"
                  size="small"
                  disabled={!nearCount}
                  onClick={() =>
                    onNearbySelect({ lat: dropPoint[0], lng: dropPoint[1] }, radiusKm)
                  }
                >
                  Trouver les {unitPlural} proches
                  {countLoading ? ' …' : nearCount != null ? ` (${nearCount})` : ''}
                </Button>
              )}
              {!onNearbySelect && nearCount != null && (
                <Chip
                  size="small"
                  color="primary"
                  label={`${nearCount} ${unitFor(nearCount)} dans ${radiusKm} km`}
                />
              )}
              <Button size="small" color="inherit" onClick={() => setDropPoint(null)}>
                Retirer le point
              </Button>
            </Stack>
          )}
        </Stack>
      </Paper>

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

          <MapRefSetter mapRef={mapRef} />
          <ClickToPlace onPlace={setDropPoint} />

          {dropPoint && (
            <>
              <Circle
                center={dropPoint}
                radius={radiusKm * 1000}
                pathOptions={{ color: '#1565c0', fillColor: '#1565c0', fillOpacity: 0.08 }}
              />
              <Marker
                position={dropPoint}
                icon={dropIcon}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const ll = (e.target as L.Marker).getLatLng();
                    setDropPoint([ll.lat, ll.lng]);
                  },
                }}
              >
                <Popup>
                  <Typography variant="caption">
                    Centre du rayon ({radiusKm} km)
                    <br />
                    {countLoading
                      ? 'Calcul…'
                      : nearCount != null
                        ? `${nearCount} ${unitFor(nearCount)} dans ce rayon`
                        : ''}
                  </Typography>
                </Popup>
              </Marker>
            </>
          )}

          {/* Points par secteur postal (FSA) — regroupés en clusters au dézoom,
              dont l'icône AFFICHE LA SOMME des personnes (pas le nombre de points). */}
          <MarkerClusterGroup
            chunkedLoading
            showCoverageOnHover={false}
            maxClusterRadius={60}
            disableClusteringAtZoom={12}
            iconCreateFunction={clusterIcon}
          >
            {points.map((p) => (
              <Marker
                key={`${p.lat}|${p.lng}`}
                position={[p.lat, p.lng]}
                icon={makeCountIcon(p.count, p.source)}
                {...({ prospectCount: p.count } as any)}
              >
                <Popup>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                      {p.label}
                    </Typography>
                    <Chip
                      label={`${p.count} ${unitFor(p.count)}`}
                      color="primary"
                      size="small"
                      sx={{ mb: 1 }}
                    />
                    {onNearbySelect && (
                      <Button
                        variant="contained"
                        size="small"
                        fullWidth
                        onClick={() =>
                          onNearbySelect({ lat: p.lat, lng: p.lng }, SECTOR_RADIUS_KM, p.label)
                        }
                      >
                        Voir ces {unitPlural}
                      </Button>
                    )}
                  </Box>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </Paper>

      <Box sx={{ mt: 1, px: 1, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {points.some((p) => p.source === 'address') ? 'Pastille verte = adresse exacte · bleue' : 'Pastille bleue'} = position au
          code postal (secteur) · orange = centre-ville approximatif ({unitPlural} sans code
          postal)
        </Typography>
        {unplaced > 0 && (
          <Typography variant="caption" color="text.secondary">
            {unplaced} {unitFor(unplaced)} non géolocalisé{unplaced > 1 ? 's' : ''} (adresse
            manquante ou non reconnue)
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default GeoPointsMap;
