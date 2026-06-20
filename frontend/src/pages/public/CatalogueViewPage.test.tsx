import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import CatalogueViewPage from './CatalogueViewPage';
import { publicCatalogueService, type PublicCatalogue } from '@/services/public-catalogue.service';

// Page publique (lien partagé) : la donnée vient d'un seul appel service piloté
// par le token de l'URL. On le mocke pour piloter chargement / données / erreur
// sans toucher au réseau et garder le test centré sur le comportement.
vi.mock('@/services/public-catalogue.service', () => ({
  publicCatalogueService: {
    getCatalogueByToken: vi.fn(),
  },
}));

const getCatalogueByToken = vi.mocked(publicCatalogueService.getCatalogueByToken);

function makeCatalogue(overrides: Partial<PublicCatalogue> = {}): PublicCatalogue {
  return {
    id: 'cat-1',
    title: 'Sélection sécurité — Montréal',
    customMessage: 'Voici les profils retenus pour votre poste.',
    status: 'SENT',
    isContentRestricted: false,
    requiresPayment: false,
    isPaid: true,
    client: { id: 'cl-1', name: 'Acme', companyName: 'Acme Sécurité inc.' },
    items: [
      {
        id: 'it-1',
        order: 0,
        candidate: {
          id: 'c-1',
          firstName: 'Jean',
          lastName: 'Tremblay',
          city: 'Montréal',
          province: 'QC',
          status: 'QUALIFIE',
          globalRating: 9,
          videoUrl: 'https://example.com/video.mp4',
          cvUrl: 'https://example.com/cv.pdf',
          languages: [{ language: 'Français', level: 'Avancé' }],
          experiences: [{ companyName: 'GardienPlus', position: 'Agent de sécurité', durationMonths: 24 }],
        },
      },
      {
        id: 'it-2',
        order: 1,
        candidate: {
          id: 'c-2',
          firstName: 'Marie',
          lastName: 'Gagnon',
          city: 'Laval',
          province: 'QC',
          status: 'QUALIFIE',
          globalRating: 8,
        },
      },
    ],
    ...overrides,
  };
}

// Rend la page derrière une route paramétrée pour que useParams récupère le token.
function renderCatalogue(token = 'jeton-partage-123') {
  return renderWithProviders(
    <Routes>
      <Route path="/catalogues/view/:token" element={<CatalogueViewPage />} />
    </Routes>,
    { route: `/catalogues/view/${token}` }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CatalogueViewPage', () => {
  it('affiche un indicateur de chargement avant la réponse du service', () => {
    // Promesse jamais résolue → reste en chargement.
    getCatalogueByToken.mockReturnValue(new Promise(() => {}));
    renderCatalogue();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('charge le catalogue à partir du token de l\'URL et rend l\'en-tête + les candidats', async () => {
    getCatalogueByToken.mockResolvedValue(makeCatalogue());
    renderCatalogue('jeton-abc');

    // En-tête : titre du catalogue puis nom de l'entreprise cliente.
    expect(await screen.findByRole('heading', { name: /sélection sécurité — montréal/i })).toBeInTheDocument();
    expect(screen.getByText('Acme Sécurité inc.')).toBeInTheDocument();
    expect(screen.getByText('Voici les profils retenus pour votre poste.')).toBeInTheDocument();

    // Compteur de candidats (pluriel) + cartes candidats.
    expect(screen.getByText('2 candidats')).toBeInTheDocument();
    expect(screen.getByText('Jean Tremblay')).toBeInTheDocument();
    expect(screen.getByText('Marie Gagnon')).toBeInTheDocument();

    // Le service a bien été appelé avec le token de l'URL.
    expect(getCatalogueByToken).toHaveBeenCalledWith('jeton-abc');
    // Le spinner a disparu.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('affiche un message d\'erreur quand le service échoue', async () => {
    getCatalogueByToken.mockRejectedValue({ response: { data: { error: 'Lien expiré' } } });
    renderCatalogue();

    expect(await screen.findByText('Lien expiré')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('affiche le bandeau de contenu restreint et verrouille les actions candidat', async () => {
    getCatalogueByToken.mockResolvedValue(makeCatalogue({ isContentRestricted: true }));
    renderCatalogue();

    await screen.findByRole('heading', { name: /sélection sécurité/i });

    expect(screen.getByText(/certains détails sont masqués/i)).toBeInTheDocument();
    // Les boutons vidéo / CV cèdent la place à un bouton verrouillé désactivé.
    const locked = screen.getAllByRole('button', { name: /contenu verrouillé/i });
    expect(locked.length).toBeGreaterThan(0);
    expect(locked[0]).toBeDisabled();
    expect(screen.queryByRole('button', { name: /voir vidéo/i })).not.toBeInTheDocument();
  });

  it('ouvre la vidéo du candidat dans un nouvel onglet au clic', async () => {
    getCatalogueByToken.mockResolvedValue(makeCatalogue());
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();

    renderCatalogue();
    await screen.findByText('Jean Tremblay');

    await user.click(screen.getByRole('button', { name: /voir vidéo/i }));

    expect(openSpy).toHaveBeenCalledWith('https://example.com/video.mp4', '_blank');
    openSpy.mockRestore();
  });

  it('utilise le singulier quand le catalogue ne contient qu\'un candidat', async () => {
    const base = makeCatalogue();
    getCatalogueByToken.mockResolvedValue({ ...base, items: [base.items[0]] });
    renderCatalogue();

    expect(await screen.findByText('1 candidat')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
  });
});
