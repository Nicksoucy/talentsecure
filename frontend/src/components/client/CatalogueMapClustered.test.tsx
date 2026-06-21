import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';

// --- Libs carto lourdes : mockées ENTIÈREMENT (jsdom n'a pas de DOM carto -> hang/crash) ---
vi.mock('react-leaflet', () => {
  const MapContainer = ({ children }: any) => <div data-testid="map">{children}</div>;
  MapContainer.displayName = 'MapContainer';
  const TileLayer = () => null;
  TileLayer.displayName = 'TileLayer';
  const Marker = ({ children }: any) => <div data-testid="marker">{children}</div>;
  Marker.displayName = 'Marker';
  const Popup = ({ children }: any) => <div data-testid="popup">{children}</div>;
  Popup.displayName = 'Popup';
  return { MapContainer, TileLayer, Marker, Popup };
});

vi.mock('react-leaflet-cluster', () => {
  const MarkerClusterGroup = ({ children }: any) => <div data-testid="cluster">{children}</div>;
  MarkerClusterGroup.displayName = 'MarkerClusterGroup';
  return { default: MarkerClusterGroup };
});

// leaflet : seules les icônes sont utilisées (L.Icon, L.Icon.Default)
vi.mock('leaflet', () => {
  class Icon {
    static Default = { prototype: {}, mergeOptions: vi.fn() };
    constructor(_opts?: unknown) {}
  }
  return { default: { Icon } };
});

// Le CSS leaflet ne doit pas être chargé en jsdom
vi.mock('leaflet/dist/leaflet.css', () => ({}));

// Réseau : axios appelé directement par le composant
vi.mock('axios');

import axios from 'axios';
import CatalogueMapClustered from './CatalogueMapClustered';
import { useClientAuthStore } from '@/store/clientAuthStore';

const mockedGet = axios.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Un token est requis pour déclencher le fetch (useEffect : catalogueId && accessToken)
  useClientAuthStore.setState({ accessToken: 'tok-test' });
});

describe('CatalogueMapClustered', () => {
  it('rend la carte avec un marqueur par ville géolocalisée', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { data: [{ city: 'Montréal', count: 3 }, { city: 'Québec', count: 1 }] },
    });

    renderWithProviders(<CatalogueMapClustered catalogueId="cat-1" />);

    // La carte (mock) finit par apparaître après le chargement async
    expect(await screen.findByTestId('map')).toBeInTheDocument();
    // Un marqueur par ville présente dans quebecCitiesCoordinates
    const markers = await screen.findAllByTestId('marker');
    expect(markers).toHaveLength(2);
    // Le contenu des popups lit bien les données (pluriel/singulier)
    expect(screen.getByText('3 candidats disponibles')).toBeInTheDocument();
    expect(screen.getByText('1 candidat disponible')).toBeInTheDocument();
  });

  it('ignore les villes sans coordonnées connues (aucun marqueur)', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { data: [{ city: 'VilleInconnueXYZ', count: 5 }] },
    });

    renderWithProviders(<CatalogueMapClustered catalogueId="cat-1" />);

    // La carte s'affiche (cityStats non vide) mais aucun marqueur n'est rendu
    expect(await screen.findByTestId('map')).toBeInTheDocument();
    expect(screen.queryAllByTestId('marker')).toHaveLength(0);
  });

  it('affiche un message quand aucune donnée géographique', async () => {
    mockedGet.mockResolvedValueOnce({ data: { data: [] } });

    renderWithProviders(<CatalogueMapClustered catalogueId="cat-1" />);

    expect(await screen.findByText(/aucune donnée géographique disponible/i)).toBeInTheDocument();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });

  it('affiche une erreur si la requête échoue', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedGet.mockRejectedValueOnce(new Error('boom'));

    renderWithProviders(<CatalogueMapClustered catalogueId="cat-1" />);

    expect(await screen.findByText(/erreur lors du chargement des données/i)).toBeInTheDocument();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });

  it('appelle onCityClick avec la ville et le compte au clic sur le bouton', async () => {
    const user = userEvent.setup();
    const onCityClick = vi.fn();
    mockedGet.mockResolvedValueOnce({
      data: { data: [{ city: 'Laval', count: 2 }] },
    });

    renderWithProviders(<CatalogueMapClustered catalogueId="cat-1" onCityClick={onCityClick} />);

    const btn = await screen.findByRole('button', { name: /demander ces candidats/i });
    await user.click(btn);

    expect(onCityClick).toHaveBeenCalledTimes(1);
    expect(onCityClick).toHaveBeenCalledWith('Laval', 2);
  });

  it('appelle l’endpoint stats/by-city avec le bon catalogueId et le token', async () => {
    mockedGet.mockResolvedValueOnce({ data: { data: [{ city: 'Gatineau', count: 1 }] } });

    renderWithProviders(<CatalogueMapClustered catalogueId="cat-42" />);

    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));
    const [url, config] = mockedGet.mock.calls[0];
    expect(url).toContain('/api/client-auth/catalogues/cat-42/stats/by-city');
    expect(config?.headers?.Authorization).toBe('Bearer tok-test');
  });
});
