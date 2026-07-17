import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import GeoPointsMap from './GeoPointsMap';

// --- Mocks des libs carto lourdes (jsdom n'a pas de vrai DOM Leaflet) ----------
// react-leaflet : tout passe en pass-through pour pouvoir observer les markers.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => {
    const C = ({ children: c }: any) => <div data-testid="map">{c}</div>;
    C.displayName = 'MapContainer';
    return <C>{children}</C>;
  },
  TileLayer: () => null,
  Marker: ({ children }: any) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
  Circle: () => <div data-testid="circle" />,
  useMap: () => ({ setView: vi.fn() }),
  useMapEvents: () => ({}),
}));

// react-leaflet-cluster : conteneur transparent qui rend ses enfants.
vi.mock('react-leaflet-cluster', () => ({
  default: ({ children }: any) => <div data-testid="cluster">{children}</div>,
}));

// leaflet : utilisé au chargement du module (Icon.Default.mergeOptions) + divIcon.
vi.mock('leaflet', () => {
  const Icon: any = { Default: { prototype: {}, mergeOptions: vi.fn() } };
  return {
    default: {
      Icon,
      divIcon: vi.fn(() => ({})),
      point: vi.fn(() => ({})),
    },
  };
});

// Import CSS de Leaflet : no-op en test.
vi.mock('leaflet/dist/leaflet.css', () => ({}));

// Service réseau.
vi.mock('@/services/api', () => ({
  default: { get: vi.fn() },
}));

import api from '@/services/api';
const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;

const POINTS_URL = '/api/prospects/stats/map-points';
const LIST_URL = '/api/prospects';

const samplePoints = [
  { lat: 45.5, lng: -73.6, count: 120, source: 'postal', label: 'H2X (Montréal)' },
  { lat: 46.8, lng: -71.3, count: 8, source: 'city', label: 'Québec (centre-ville)' },
];

// Réponse par défaut de l'endpoint points-de-carte.
function mockPointsResponse(points = samplePoints, unplaced = 0) {
  mockGet.mockImplementation((url: string) => {
    if (url === POINTS_URL) {
      return Promise.resolve({ data: { data: { points, unplaced } } });
    }
    return Promise.resolve({ data: { pagination: { total: 0 } } });
  });
}

function renderMap(props: Partial<React.ComponentProps<typeof GeoPointsMap>> = {}) {
  return renderWithProviders(
    <GeoPointsMap
      pointsUrl={POINTS_URL}
      listUrl={LIST_URL}
      unitSingular="candidat"
      unitPlural="candidats"
      {...props}
    />
  );
}

describe('GeoPointsMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('charge les points et rend un marqueur par point reçu', async () => {
    mockPointsResponse();
    renderMap();

    // Le conteneur de carte apparaît une fois le chargement terminé.
    expect(await screen.findByTestId('map')).toBeInTheDocument();

    // Un marqueur par point (aucun point déposé => pas de marqueur « centre »).
    await waitFor(() => {
      expect(screen.getAllByTestId('marker')).toHaveLength(samplePoints.length);
    });

    // Les labels des points sont rendus dans les popups.
    expect(screen.getByText('H2X (Montréal)')).toBeInTheDocument();
    expect(screen.getByText('Québec (centre-ville)')).toBeInTheDocument();

    // L'endpoint points a bien été appelé avec la bonne URL.
    expect(mockGet).toHaveBeenCalledWith(POINTS_URL);
  });

  it('affiche le spinner puis disparaît, et la légende des pastilles', async () => {
    mockPointsResponse();
    renderMap();

    // État de chargement : un CircularProgress (role progressbar) au départ.
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    await screen.findByTestId('map');

    // La légende explicative est présente une fois chargé.
    expect(
      screen.getByText(/Pastille bleue = position au code postal/i)
    ).toBeInTheDocument();
  });

  it('gère le cas sans point (aucun marqueur, message des non géolocalisés)', async () => {
    mockPointsResponse([], 7);
    renderMap();

    expect(await screen.findByTestId('map')).toBeInTheDocument();
    expect(screen.queryAllByTestId('marker')).toHaveLength(0);

    // Le compteur des non géolocalisés est affiché (pluriel).
    expect(
      screen.getByText(/7 candidats non géolocalisés/i)
    ).toBeInTheDocument();
  });

  it("affiche les points source 'address' avec la légende « adresse exacte » (carte des agents)", async () => {
    mockPointsResponse([
      { lat: 45.5, lng: -73.55, count: 1, source: 'address', label: 'Jean Tremblay' },
      { lat: 46.8, lng: -71.3, count: 8, source: 'city', label: 'Québec (centre-ville)' },
    ]);
    renderMap({ unitSingular: 'agent', unitPlural: 'agents' });

    expect(await screen.findByTestId('map')).toBeInTheDocument();
    // Le pin à l'adresse exacte porte le nom de l'agent.
    expect(screen.getByText('Jean Tremblay')).toBeInTheDocument();
    // La légende gagne l'entrée verte SEULEMENT quand des points 'address' existent.
    expect(screen.getByText(/Pastille verte = adresse exacte/i)).toBeInTheDocument();
  });

  it("sans point 'address' : pas d'entrée « adresse exacte » dans la légende", async () => {
    mockPointsResponse();
    renderMap();

    await screen.findByTestId('map');
    expect(screen.queryByText(/adresse exacte/i)).not.toBeInTheDocument();
  });

  it("affiche un message d'erreur si le chargement des points échoue", async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    renderMap();

    expect(
      await screen.findByText('Erreur lors du chargement des données')
    ).toBeInTheDocument();
    // La carte ne doit pas être rendue en cas d'erreur.
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });

  it('localise une recherche par code postal et dépose un point', async () => {
    const resolved = { lat: 45.51, lng: -73.57 };
    mockGet.mockImplementation((url: string) => {
      if (url === POINTS_URL) {
        return Promise.resolve({ data: { data: { points: samplePoints, unplaced: 0 } } });
      }
      if (url === '/api/geo/resolve') {
        return Promise.resolve({ data: { data: resolved } });
      }
      // listUrl (compteur dans le rayon)
      return Promise.resolve({ data: { pagination: { total: 3 } } });
    });

    const user = userEvent.setup();
    renderMap();
    await screen.findByTestId('map');

    const input = screen.getByPlaceholderText(/Code postal/i);
    await user.type(input, 'H2X 1Y4');
    await user.click(screen.getByRole('button', { name: 'Localiser' }));

    // L'endpoint geo a été interrogé avec la requête saisie.
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/geo/resolve', {
        params: { q: 'H2X 1Y4' },
      });
    });

    // Le point déposé fait apparaître le cercle de rayon.
    expect(await screen.findByTestId('circle')).toBeInTheDocument();
  });
});
