import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, within } from '@/test/renderWithProviders';

/**
 * Leaflet et react-leaflet n'ont pas de vrai DOM carto sous jsdom (mesures à 0,
 * canvas absent) → on les mocke ENTIÈREMENT. Les mocks rendent des conteneurs
 * simples (data-testid) pour pouvoir asserter le comportement du composant :
 * nombre de marqueurs rendus, contenu des popups, états vide/erreur.
 */
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => {
    const C = () => null;
    C.displayName = 'MapContainer';
    return <div data-testid="map">{children}</div>;
  },
  TileLayer: () => null,
  Marker: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="marker">{children}</div>
  ),
  Popup: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="popup">{children}</div>
  ),
  Circle: () => null,
  useMap: () => ({ setView: vi.fn() }),
  useMapEvents: () => ({}),
}));

// react-leaflet-cluster : export par défaut = MarkerClusterGroup (pass-through).
vi.mock('react-leaflet-cluster', () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="cluster">{children}</div>
  ),
}));

// leaflet : on stubbe juste ce que GeoPointsMap consomme (Icon, divIcon, point).
vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn(() => ({})),
    point: vi.fn(() => ({})),
  },
}));

// Import CSS de Leaflet : no-op sous Vitest.
vi.mock('leaflet/dist/leaflet.css', () => ({}));

// Service réseau : api.get pilote les points de la carte.
vi.mock('@/services/api', () => ({
  default: { get: vi.fn() },
}));

import ProspectsMapClustered from './ProspectsMapClustered';
import api from '@/services/api';

const apiMock = api as unknown as { get: ReturnType<typeof vi.fn> };

const makePoint = (over: Partial<Record<string, unknown>> = {}) => ({
  lat: 45.5,
  lng: -73.6,
  count: 12,
  source: 'postal',
  label: 'Secteur H2X',
  ...over,
});

/** Réponse au format attendu par GeoPointsMap : data.data.points / unplaced. */
const pointsResponse = (points: unknown[], unplaced = 0) => ({
  data: { data: { points, unplaced } },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProspectsMapClustered', () => {
  it('appelle le bon endpoint de points (CV) et rend la carte', async () => {
    apiMock.get.mockResolvedValueOnce(pointsResponse([makePoint()]));

    renderWithProviders(<ProspectsMapClustered />);

    await waitFor(() => expect(screen.getByTestId('map')).toBeInTheDocument());
    expect(apiMock.get).toHaveBeenCalledWith('/api/prospects/stats/map-points');
  });

  it('rend un marqueur par point retourné avec le bon label et compte', async () => {
    apiMock.get.mockResolvedValueOnce(
      pointsResponse([
        makePoint({ lat: 45.5, lng: -73.6, count: 12, label: 'Secteur H2X' }),
        makePoint({ lat: 46.8, lng: -71.2, count: 3, label: 'Secteur G1R' }),
      ])
    );

    renderWithProviders(<ProspectsMapClustered />);

    await waitFor(() => expect(screen.getByTestId('cluster')).toBeInTheDocument());

    // Les marqueurs des points vivent dans le cluster.
    const cluster = screen.getByTestId('cluster');
    const markers = within(cluster).getAllByTestId('marker');
    expect(markers).toHaveLength(2);

    expect(screen.getByText('Secteur H2X')).toBeInTheDocument();
    expect(screen.getByText('Secteur G1R')).toBeInTheDocument();
    // Unité « CV » + accord (count > 1 → pluriel = 'CV' identique).
    expect(screen.getByText('12 CV')).toBeInTheDocument();
    expect(screen.getByText('3 CV')).toBeInTheDocument();
  });

  it('état vide : aucun point → carte rendue sans marqueur de secteur', async () => {
    apiMock.get.mockResolvedValueOnce(pointsResponse([], 0));

    renderWithProviders(<ProspectsMapClustered />);

    await waitFor(() => expect(screen.getByTestId('cluster')).toBeInTheDocument());
    const cluster = screen.getByTestId('cluster');
    expect(within(cluster).queryByTestId('marker')).not.toBeInTheDocument();
  });

  it('affiche le décompte de CV non géolocalisés quand unplaced > 0', async () => {
    apiMock.get.mockResolvedValueOnce(pointsResponse([makePoint()], 7));

    renderWithProviders(<ProspectsMapClustered />);

    await waitFor(() => expect(screen.getByTestId('map')).toBeInTheDocument());
    expect(screen.getByText(/7 CV non géolocalisés/i)).toBeInTheDocument();
  });

  it('erreur réseau → message d’erreur, pas de carte', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    apiMock.get.mockRejectedValueOnce(new Error('boom'));

    renderWithProviders(<ProspectsMapClustered />);

    await waitFor(() =>
      expect(screen.getByText(/erreur lors du chargement des données/i)).toBeInTheDocument()
    );
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});
