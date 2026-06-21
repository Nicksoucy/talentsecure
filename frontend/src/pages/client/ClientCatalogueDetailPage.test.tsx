import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import { useClientAuthStore } from '@/store/clientAuthStore';
import { clientAuthService, type CatalogueDetail } from '@/services/client-auth.service';

// La page lit le catalogue via clientAuthService.getCatalogueById (useEffect +
// state local) → on mocke le service pour piloter chargement / données / erreur
// sans toucher au réseau.
vi.mock('@/services/client-auth.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/client-auth.service')>(
    '@/services/client-auth.service'
  );
  return {
    ...actual,
    clientAuthService: {
      ...actual.clientAuthService,
      getCatalogueById: vi.fn(),
    },
  };
});

// Enfants lourds (cartes Leaflet, lecteur vidéo, dialogue de demande) :
// hors-sujet pour la page et sources de hang → neutralisés.
vi.mock('@/components/client/CatalogueMap', () => ({ default: () => null }));
vi.mock('@/components/client/CatalogueMapClustered', () => ({ default: () => null }));
vi.mock('@/components/client/VideoPlayerModal', () => ({ default: () => null }));
vi.mock('@/components/client/RequestCandidatesDialog', () => ({ default: () => null }));

import ClientCatalogueDetailPage from './ClientCatalogueDetailPage';

const getCatalogueById = vi.mocked(clientAuthService.getCatalogueById);

function makeCatalogue(overrides: Partial<CatalogueDetail> = {}): CatalogueDetail {
  return {
    id: 'cat-1',
    title: 'Agents de sécurité — Montréal',
    status: 'PUBLISHED',
    requiresPayment: false,
    isPaid: false,
    isContentRestricted: false,
    createdAt: '2026-06-19T00:00:00.000Z',
    items: [
      {
        id: 'item-1',
        order: 0,
        candidate: {
          id: 'c1',
          firstName: 'Jean',
          lastName: 'Tremblay',
          city: 'Montréal',
          province: 'QC',
          status: 'QUALIFIED',
          globalRating: 9,
          videoUrl: 'https://example.com/video.mp4',
          cvUrl: 'https://example.com/cv.pdf',
          languages: [{ language: 'Français', level: 'Natif' }],
          experiences: [{ companyName: 'SecuriCorp', position: 'Agent', durationMonths: 24 }],
        },
      },
    ],
    ...overrides,
  };
}

// Rend la page derrière une route paramétrée pour que useParams récupère l'id.
function renderDetail(id = 'cat-1') {
  return renderWithProviders(
    <Routes>
      <Route path="/client/catalogues/:id" element={<ClientCatalogueDetailPage />} />
    </Routes>,
    { route: `/client/catalogues/${id}` }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // loadCatalogue ne s'exécute que si un accessToken est présent dans le store.
  useClientAuthStore.getState().setAuth(
    { id: 'cl1', name: 'Acme Sécurité', email: 'contact@acme.test' },
    'tok-123',
    'refresh-123'
  );
});

afterEach(() => {
  useClientAuthStore.getState().logout();
});

describe('ClientCatalogueDetailPage', () => {
  it('affiche un indicateur de chargement avant la réponse du service', () => {
    // Promesse jamais résolue → reste en chargement.
    getCatalogueById.mockReturnValue(new Promise(() => {}));
    renderDetail();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('rend le titre du catalogue et le candidat une fois les données chargées', async () => {
    getCatalogueById.mockResolvedValue(makeCatalogue());
    renderDetail();

    // Titre présent (en-tête + corps) une fois chargé.
    expect(await screen.findAllByText('Agents de sécurité — Montréal')).not.toHaveLength(0);
    expect(screen.getByText('Jean Tremblay')).toBeInTheDocument();
    expect(screen.getByText(/répartition géographique/i)).toBeInTheDocument();
    expect(screen.getByText('1 candidat')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    // L'id de l'URL est transmis au service.
    expect(getCatalogueById).toHaveBeenCalledWith('cat-1', 'tok-123');
  });

  it('masque le contenu sensible quand le catalogue est restreint', async () => {
    getCatalogueById.mockResolvedValue(makeCatalogue({ isContentRestricted: true }));
    renderDetail();

    expect(await screen.findByText('Jean Tremblay')).toBeInTheDocument();
    // Avertissement de restriction + bouton verrouillé à la place des actions.
    expect(screen.getByText(/certains détails sont masqués/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /contenu verrouillé/i })).toBeInTheDocument();
    // Les actions normales (entrevue/CV) ne sont plus proposées.
    expect(screen.queryByRole('button', { name: /voir entrevue/i })).not.toBeInTheDocument();
  });

  it("affiche une alerte d'erreur quand le service échoue", async () => {
    getCatalogueById.mockRejectedValue({
      response: { data: { error: 'Catalogue inaccessible' } },
    });
    renderDetail();

    // L'alerte d'erreur et le snackbar affichent tous deux le message.
    expect(await screen.findAllByText('Catalogue inaccessible')).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: /retour au tableau de bord/i })).toBeInTheDocument();
  });

  it('bascule la vue de la carte entre Zones et Marqueurs', async () => {
    getCatalogueById.mockResolvedValue(makeCatalogue());
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('Jean Tremblay');

    const zones = screen.getByRole('button', { name: /vue cercles/i });
    const marqueurs = screen.getByRole('button', { name: /vue marqueurs/i });
    expect(zones).toHaveAttribute('aria-pressed', 'true');

    await user.click(marqueurs);
    await waitFor(() => expect(marqueurs).toHaveAttribute('aria-pressed', 'true'));
    expect(zones).toHaveAttribute('aria-pressed', 'false');
  });
});
