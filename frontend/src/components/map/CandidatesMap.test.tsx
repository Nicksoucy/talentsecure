import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, within } from '@/test/renderWithProviders';

/**
 * react-leaflet rend une vraie carte Leaflet : jsdom n'a pas le DOM carto
 * (mesures, tuiles, gestes) → hang/crash. On mocke ENTIÈREMENT le module par des
 * pass-through qui exposent les enfants (Marker/Popup → contenu testable) et un
 * conteneur `data-testid="map"`. On capture aussi les positions des marqueurs
 * pour vérifier qu'un point = un marqueur.
 */
const markerPositions: unknown[] = [];

vi.mock('react-leaflet', () => {
  const MapContainer = ({ children }: any) => <div data-testid="map">{children}</div>;
  MapContainer.displayName = 'MapContainer';
  const TileLayer = () => null;
  TileLayer.displayName = 'TileLayer';
  const Marker = ({ children, position }: any) => {
    markerPositions.push(position);
    return <div data-testid="marker">{children}</div>;
  };
  Marker.displayName = 'Marker';
  const Popup = ({ children }: any) => <div data-testid="popup">{children}</div>;
  Popup.displayName = 'Popup';
  const Circle = () => null;
  Circle.displayName = 'Circle';
  return {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Circle,
    useMap: () => ({ setView: vi.fn() }),
    useMapEvents: () => ({}),
  };
});

// Cluster : pass-through qui rend simplement ses enfants (les marqueurs).
vi.mock('react-leaflet-cluster', () => {
  const MarkerClusterGroup = ({ children }: any) => <div data-testid="cluster">{children}</div>;
  MarkerClusterGroup.displayName = 'MarkerClusterGroup';
  return { default: MarkerClusterGroup };
});

// leaflet : seules les fabriques d'icônes sont utilisées au montage (divIcon,
// point, Icon.Default). On stub le strict nécessaire pour éviter le vrai code.
vi.mock('leaflet', () => {
  const L = {
    divIcon: (o: unknown) => o,
    point: (...args: unknown[]) => args,
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    Marker: class {},
    Map: class {},
  };
  return { default: L };
});

// La feuille de style Leaflet n'a aucun intérêt en test (et casse l'import).
vi.mock('leaflet/dist/leaflet.css', () => ({}));

// Service réseau : le composant appelle api.get(pointsUrl) au montage puis
// api.get(listUrl, ...) pour le compteur de rayon. On le mocke entièrement.
vi.mock('@/services/api', () => ({
  default: { get: vi.fn() },
}));

import CandidatesMap from './CandidatesMap';
import api from '@/services/api';

const apiGet = api.get as unknown as ReturnType<typeof vi.fn>;

const MAP_POINTS = {
  data: {
    data: {
      unplaced: 3,
      points: [
        { lat: 45.5, lng: -73.56, count: 42, source: 'postal', label: 'H2X (Montréal)' },
        { lat: 46.81, lng: -71.21, count: 7, source: 'city', label: 'Québec (centre-ville)' },
      ],
    },
  },
};

describe('CandidatesMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markerPositions.length = 0;
    // Par défaut : les points se chargent, le compteur de rayon ne sert pas ici.
    apiGet.mockImplementation((url: string) => {
      if (url === '/api/candidates/stats/map-points') return Promise.resolve(MAP_POINTS);
      return Promise.resolve({ data: { pagination: { total: 0 } } });
    });
  });

  it('charge les points depuis l’endpoint candidats et rend la carte', async () => {
    renderWithProviders(<CandidatesMap />);

    expect(await screen.findByTestId('map')).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith('/api/candidates/stats/map-points');
  });

  it('rend un marqueur par point reçu', async () => {
    renderWithProviders(<CandidatesMap />);

    await screen.findByTestId('map');
    // Deux points de données → deux marqueurs (pas de point déposé au montage).
    await waitFor(() => expect(markerPositions).toHaveLength(2));
    expect(markerPositions).toContainEqual([45.5, -73.56]);
    expect(markerPositions).toContainEqual([46.81, -71.21]);
  });

  it('affiche les libellés et compteurs des points avec l’unité « candidats »', async () => {
    renderWithProviders(<CandidatesMap />);

    await screen.findByTestId('map');
    expect(await screen.findByText('H2X (Montréal)')).toBeInTheDocument();
    // count=42 > 1 → pluriel ; count=7 > 1 → pluriel.
    expect(await screen.findByText('42 candidats')).toBeInTheDocument();
    expect(await screen.findByText('7 candidats')).toBeInTheDocument();
  });

  it('affiche le nombre de candidats non géolocalisés (unplaced)', async () => {
    renderWithProviders(<CandidatesMap />);

    await screen.findByTestId('map');
    expect(
      await screen.findByText(/3 candidats non géolocalisés/i)
    ).toBeInTheDocument();
  });

  it('affiche le bouton « Voir ces candidats » quand onNearbySelect est fourni', async () => {
    const onNearbySelect = vi.fn();
    renderWithProviders(<CandidatesMap onNearbySelect={onNearbySelect} />);

    await screen.findByTestId('map');
    const buttons = await screen.findAllByRole('button', { name: /Voir ces candidats/i });
    expect(buttons.length).toBeGreaterThan(0);

    const popup = buttons[0].closest('[data-testid="popup"]') as HTMLElement;
    within(popup).getByRole('button', { name: /Voir ces candidats/i }).click();
    // Le 1er point de MAP_POINTS est H2X / Montréal.
    expect(onNearbySelect).toHaveBeenCalledWith(
      { lat: 45.5, lng: -73.56 },
      expect.any(Number),
      'H2X (Montréal)'
    );
  });

  it('affiche un message d’erreur si le chargement des points échoue', async () => {
    apiGet.mockRejectedValueOnce(new Error('boom'));
    renderWithProviders(<CandidatesMap />);

    expect(
      await screen.findByText(/Erreur lors du chargement des données/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });
});
