import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';

// ── react-leaflet : entièrement mocké (jsdom n'a pas de vrai DOM carto → hang/crash).
// On rend des conteneurs simples qui exposent les enfants pour pouvoir asserter le
// contenu des popups (ville, badge, bouton) et compter les cercles via un data-testid.
vi.mock('react-leaflet', () => {
  const MapContainer = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="map">{children}</div>
  );
  MapContainer.displayName = 'MapContainer';
  const TileLayer = () => null;
  TileLayer.displayName = 'TileLayer';
  const Circle = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="circle">{children}</div>
  );
  Circle.displayName = 'Circle';
  const Popup = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="popup">{children}</div>
  );
  Popup.displayName = 'Popup';
  return { MapContainer, TileLayer, Circle, Popup };
});

// ── leaflet : le composant manipule L.Icon.Default au chargement du module.
// On fournit le minimum pour que le `delete` et `mergeOptions` ne plantent pas.
vi.mock('leaflet', () => ({
  default: {
    Icon: {
      Default: {
        prototype: { _getIconUrl: undefined },
        mergeOptions: vi.fn(),
      },
    },
  },
}));

// ── axios : appel HTTP direct du composant remplacé par un mock contrôlable.
vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

import axios from 'axios';
import CatalogueMap from './CatalogueMap';
import { useClientAuthStore } from '@/store/clientAuthStore';

const mockedGet = axios.get as ReturnType<typeof vi.fn>;

describe('CatalogueMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Token requis sinon le useEffect ne déclenche pas le fetch.
    useClientAuthStore.setState({ accessToken: 'tok-test' });
  });

  it('affiche un spinner pendant le chargement', () => {
    // Promesse jamais résolue → reste en état de chargement.
    mockedGet.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<CatalogueMap catalogueId="cat-1" />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });

  it('rend la carte avec un cercle par ville reconnue et le contenu du popup', async () => {
    mockedGet.mockResolvedValue({
      data: {
        data: [
          { city: 'Montréal', count: 25 },
          { city: 'Québec', count: 3 },
        ],
      },
    });

    renderWithProviders(<CatalogueMap catalogueId="cat-1" />);

    await waitFor(() => expect(screen.getByTestId('map')).toBeInTheDocument());

    // Deux villes connues de quebecCitiesCoordinates → deux cercles.
    expect(screen.getAllByTestId('circle')).toHaveLength(2);
    expect(screen.getByText('Montréal')).toBeInTheDocument();
    expect(screen.getByText('Québec')).toBeInTheDocument();
    // Pluriel/singulier dans le label du chip.
    expect(screen.getByText('25 candidats')).toBeInTheDocument();
    expect(screen.getByText('3 candidats')).toBeInTheDocument();

    // L'URL du fetch contient l'id de catalogue + l'en-tête Authorization.
    expect(mockedGet).toHaveBeenCalledWith(
      expect.stringContaining('/catalogues/cat-1/stats/by-city'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok-test' }),
      }),
    );
  });

  it('ignore les villes sans coordonnées connues (aucun cercle rendu)', async () => {
    mockedGet.mockResolvedValue({
      data: { data: [{ city: 'VilleInconnueXYZ', count: 10 }] },
    });

    renderWithProviders(<CatalogueMap catalogueId="cat-1" />);

    // La carte se rend, mais aucun cercle car coords introuvables (Circle → null).
    await waitFor(() => expect(screen.getByTestId('map')).toBeInTheDocument());
    expect(screen.queryByTestId('circle')).not.toBeInTheDocument();
  });

  it('affiche un état vide quand aucune donnée géographique', async () => {
    mockedGet.mockResolvedValue({ data: { data: [] } });

    renderWithProviders(<CatalogueMap catalogueId="cat-1" />);

    await waitFor(() =>
      expect(screen.getByText('Aucune donnée géographique disponible')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });

  it('affiche un message d\'erreur si le fetch échoue', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedGet.mockRejectedValue(new Error('boom'));

    renderWithProviders(<CatalogueMap catalogueId="cat-1" />);

    await waitFor(() =>
      expect(screen.getByText('Erreur lors du chargement des données')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });

  it('appelle onCityClick avec la ville et le nombre depuis le popup', async () => {
    const onCityClick = vi.fn();
    mockedGet.mockResolvedValue({
      data: { data: [{ city: 'Laval', count: 7 }] },
    });

    renderWithProviders(<CatalogueMap catalogueId="cat-1" onCityClick={onCityClick} />);

    const button = await screen.findByRole('button', { name: 'Demander ces candidats' });
    await userEvent.click(button);

    expect(onCityClick).toHaveBeenCalledWith('Laval', 7);
  });
});
