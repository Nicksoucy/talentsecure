import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, within } from '@/test/renderWithProviders';

/**
 * Miroir de CandidatesMap.test.tsx pour la carte des AGENTS (employés actifs) :
 * react-leaflet rend une vraie carte Leaflet incompatible jsdom → pass-through
 * complets, positions des marqueurs capturées.
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

vi.mock('react-leaflet-cluster', () => {
  const MarkerClusterGroup = ({ children }: any) => <div data-testid="cluster">{children}</div>;
  MarkerClusterGroup.displayName = 'MarkerClusterGroup';
  return { default: MarkerClusterGroup };
});

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

vi.mock('leaflet/dist/leaflet.css', () => ({}));

vi.mock('@/services/api', () => ({
  default: { get: vi.fn() },
}));

import EmployeesMap from './EmployeesMap';
import api from '@/services/api';

const apiGet = api.get as unknown as ReturnType<typeof vi.fn>;

const MAP_POINTS = {
  data: {
    data: {
      unplaced: 2,
      points: [
        // Pin adresse exacte : libellé = noms des agents.
        { lat: 45.5, lng: -73.55, count: 2, source: 'address', label: 'Jean Tremblay, Marie Roy' },
        { lat: 46.81, lng: -71.21, count: 5, source: 'city', label: 'Québec (centre-ville approx.)' },
      ],
    },
  },
};

describe('EmployeesMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markerPositions.length = 0;
    apiGet.mockImplementation((url: string) => {
      if (url === '/api/employees/stats/map-points') return Promise.resolve(MAP_POINTS);
      return Promise.resolve({ data: { pagination: { total: 0 } } });
    });
  });

  it("charge les points depuis l'endpoint employés et rend la carte", async () => {
    renderWithProviders(<EmployeesMap />);

    expect(await screen.findByTestId('map')).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith('/api/employees/stats/map-points');
  });

  it('rend un marqueur par point reçu', async () => {
    renderWithProviders(<EmployeesMap />);

    await screen.findByTestId('map');
    await waitFor(() => expect(markerPositions).toHaveLength(2));
    expect(markerPositions).toContainEqual([45.5, -73.55]);
    expect(markerPositions).toContainEqual([46.81, -71.21]);
  });

  it('affiche les noms des agents (pins adresse) et l\'unité « agents »', async () => {
    renderWithProviders(<EmployeesMap />);

    await screen.findByTestId('map');
    expect(await screen.findByText('Jean Tremblay, Marie Roy')).toBeInTheDocument();
    expect(await screen.findByText('2 agents')).toBeInTheDocument();
    expect(await screen.findByText('5 agents')).toBeInTheDocument();
  });

  it('affiche le nombre d\'agents non géolocalisés (unplaced)', async () => {
    renderWithProviders(<EmployeesMap />);

    await screen.findByTestId('map');
    expect(await screen.findByText(/2 agents non géolocalisés/i)).toBeInTheDocument();
  });

  it('« Voir ces agents » remonte le point + libellé via onNearbySelect', async () => {
    const onNearbySelect = vi.fn();
    renderWithProviders(<EmployeesMap onNearbySelect={onNearbySelect} />);

    await screen.findByTestId('map');
    const buttons = await screen.findAllByRole('button', { name: /Voir ces agents/i });
    expect(buttons.length).toBeGreaterThan(0);

    const popup = buttons[0].closest('[data-testid="popup"]') as HTMLElement;
    within(popup).getByRole('button', { name: /Voir ces agents/i }).click();
    expect(onNearbySelect).toHaveBeenCalledWith(
      { lat: 45.5, lng: -73.55 },
      expect.any(Number),
      'Jean Tremblay, Marie Roy'
    );
  });

  it("affiche un message d'erreur si le chargement des points échoue", async () => {
    apiGet.mockRejectedValueOnce(new Error('boom'));
    renderWithProviders(<EmployeesMap />);

    expect(await screen.findByText(/Erreur lors du chargement des données/i)).toBeInTheDocument();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });
});
