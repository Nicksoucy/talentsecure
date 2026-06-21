import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import UnifiedProspectsMap from './UnifiedProspectsMap';

/**
 * react-leaflet rend une vraie carte (canvas/DOM géo) que jsdom ne supporte pas
 * → mock complet. On expose les `Circle` comme des <div data-testid="circle">
 * pour pouvoir compter les marqueurs et lire leur contenu (Tooltip).
 */
vi.mock('react-leaflet', () => {
  const MapContainer = ({ children }: any) => <div data-testid="map">{children}</div>;
  MapContainer.displayName = 'MapContainer';
  const TileLayer = () => null;
  TileLayer.displayName = 'TileLayer';
  const Circle = ({ children, eventHandlers }: any) => (
    <div data-testid="circle" onClick={() => eventHandlers?.click?.()}>
      {children}
    </div>
  );
  Circle.displayName = 'Circle';
  const Tooltip = ({ children }: any) => <div data-testid="tooltip">{children}</div>;
  Tooltip.displayName = 'Tooltip';
  return { MapContainer, TileLayer, Circle, Tooltip };
});

// leaflet : seul L.Icon.Default est touché au chargement du module → stub minimal.
vi.mock('leaflet', () => ({
  default: {
    Icon: {
      Default: {
        prototype: {},
        mergeOptions: vi.fn(),
      },
    },
  },
}));

// La feuille de style CSS de leaflet n'a rien à faire dans jsdom.
vi.mock('leaflet/dist/leaflet.css', () => ({}));

// Service réseau : on contrôle les deux endpoints stats par ville.
const mockGet = vi.fn();
vi.mock('@/services/clientApi', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

// Store d'auth : le fetch ne part que si accessToken est présent.
vi.mock('@/store/clientAuthStore', () => ({
  useClientAuthStore: () => ({ accessToken: 'fake-token' }),
}));

// Réponse par défaut : évalués (Montréal, Québec) + cv-only (Laval).
function wireDefaultApi() {
  mockGet.mockImplementation((url: string) => {
    if (url === '/api/client-auth/prospects/stats/by-city') {
      return Promise.resolve({
        data: {
          data: [
            { city: 'Montréal', count: 12 },
            { city: 'Québec', count: 1 },
          ],
        },
      });
    }
    if (url === '/api/client-auth/prospects-only/stats/by-city') {
      return Promise.resolve({
        data: { data: [{ city: 'Laval', count: 7 }] },
      });
    }
    return Promise.reject(new Error(`URL inattendue: ${url}`));
  });
}

describe('UnifiedProspectsMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('rend la carte et un cercle par ville évaluée connue', async () => {
    wireDefaultApi();
    renderWithProviders(<UnifiedProspectsMap />);

    expect(await screen.findByTestId('map')).toBeInTheDocument();
    // Montréal + Québec sont dans quebecCitiesCoordinates → 2 cercles.
    expect(screen.getAllByTestId('circle')).toHaveLength(2);
    // Le total des candidats (12 + 1 = 13) s'affiche dans le Chip.
    expect(screen.getByText(/13 candidats disponibles/i)).toBeInTheDocument();
  });

  it('affiche un message quand aucune donnée géographique n\'est disponible', async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    renderWithProviders(<UnifiedProspectsMap />);

    expect(
      await screen.findByText(/Aucune donnée géographique disponible/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });

  it('affiche une alerte d\'erreur quand le chargement échoue', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    renderWithProviders(<UnifiedProspectsMap />);

    expect(
      await screen.findByText(/Erreur lors du chargement des données/i)
    ).toBeInTheDocument();
  });

  it('bascule vers « CVs Seulement » et affiche les cercles CV-only', async () => {
    wireDefaultApi();
    renderWithProviders(<UnifiedProspectsMap />);

    // Attend le rendu initial (mode évalué = 2 cercles).
    await screen.findByTestId('map');
    expect(screen.getAllByTestId('circle')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: /cvs seulement/i }));

    // Laval seulement en CV-only → 1 cercle, total 7.
    await waitFor(() =>
      expect(screen.getAllByTestId('circle')).toHaveLength(1)
    );
    expect(screen.getByText(/7 candidats disponibles/i)).toBeInTheDocument();
    // L'alerte de prix économique apparaît en mode CV-only.
    expect(screen.getByText(/Économique 5-10\$ par CV/i)).toBeInTheDocument();
  });

  it('filtre les villes via la barre de recherche', async () => {
    wireDefaultApi();
    renderWithProviders(<UnifiedProspectsMap />);

    await screen.findByTestId('map');
    expect(screen.getAllByTestId('circle')).toHaveLength(2);

    await userEvent.type(
      screen.getByPlaceholderText(/Rechercher une ville/i),
      'Montréal'
    );

    // Seule Montréal correspond → 1 cercle, total filtré 12.
    await waitFor(() =>
      expect(screen.getAllByTestId('circle')).toHaveLength(1)
    );
    expect(screen.getByText(/12 candidats trouvés/i)).toBeInTheDocument();
  });
});
