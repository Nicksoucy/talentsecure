import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';
import CataloguesPage from './CataloguesPage';
import { catalogueService } from '@/services/catalogue.service';
import { clientService } from '@/services/client.service';
import { candidateService } from '@/services/candidate.service';

// La page charge ses trois jeux de données via TanStack Query → on mocke les
// services appelés pour piloter chargement / données / erreur sans réseau réel.
vi.mock('@/services/catalogue.service', () => ({
  catalogueService: {
    getCatalogues: vi.fn(),
    createCatalogue: vi.fn(),
    deleteCatalogue: vi.fn(),
    generateCataloguePDF: vi.fn(),
  },
}));
vi.mock('@/services/client.service', () => ({
  clientService: { getClients: vi.fn() },
}));
vi.mock('@/services/candidate.service', () => ({
  candidateService: { getCandidates: vi.fn() },
}));

// Enfants lourds (gros dialog de partage + bloc de filtres avancés) neutralisés :
// hors-sujet pour le comportement de la PAGE, et coûteux à monter.
vi.mock('@/components/catalogues/ShareCatalogueDialog', () => ({ default: () => null }));
vi.mock('@/components/CandidateAdvancedFilters', () => ({ default: () => null }));

const getCatalogues = vi.mocked(catalogueService.getCatalogues);
const getClients = vi.mocked(clientService.getClients);
const getCandidates = vi.mocked(candidateService.getCandidates);

function makeCatalogue(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cat-1',
    title: 'Catalogue agents de sécurité',
    status: 'BROUILLON',
    includeCV: true,
    createdAt: '2026-06-19T00:00:00.000Z',
    client: { companyName: 'SécuriCorp', name: 'Acme' },
    items: [{ id: 'i1' }, { id: 'i2' }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Valeurs par défaut « chargées » ; chaque test surcharge au besoin.
  getCatalogues.mockResolvedValue({ data: [] });
  getClients.mockResolvedValue({ data: [] } as never);
  getCandidates.mockResolvedValue({ data: [] } as never);
});

describe('CataloguesPage', () => {
  it('affiche un squelette de chargement avant la réponse', () => {
    // Promesse jamais résolue → la page reste en chargement.
    getCatalogues.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithProviders(<CataloguesPage />);

    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
    // Aucune donnée réelle ne fuite pendant le chargement.
    expect(screen.queryByText('Catalogue agents de sécurité')).not.toBeInTheDocument();
  });

  it('rend la liste des catalogues une fois les données chargées', async () => {
    getCatalogues.mockResolvedValue({
      data: [
        makeCatalogue(),
        makeCatalogue({
          id: 'cat-2',
          title: 'Catalogue répartiteurs',
          status: 'ENVOYE',
          includeCV: false,
          client: { name: 'Beta inc.' },
          items: [{ id: 'x' }],
        }),
      ],
    });

    renderWithProviders(<CataloguesPage />);

    // En-tête avec compteur basé sur les données chargées.
    expect(await screen.findByRole('heading', { name: /catalogues \(2\)/i })).toBeInTheDocument();
    expect(screen.getByText('Catalogue agents de sécurité')).toBeInTheDocument();
    expect(screen.getByText('Catalogue répartiteurs')).toBeInTheDocument();
    // Client résolu (companyName prioritaire) + statut traduit en français.
    expect(screen.getByText('SécuriCorp')).toBeInTheDocument();
    expect(screen.getByText('Envoyé')).toBeInTheDocument();
  });

  it('affiche un état vide quand aucun catalogue n\'existe', async () => {
    getCatalogues.mockResolvedValue({ data: [] });

    renderWithProviders(<CataloguesPage />);

    expect(await screen.findByText(/aucun catalogue trouvé/i)).toBeInTheDocument();
    expect(screen.getByText(/commencez par créer votre premier catalogue/i)).toBeInTheDocument();
    // L'en-tête affiche bien zéro.
    expect(screen.getByRole('heading', { name: /catalogues \(0\)/i })).toBeInTheDocument();
  });

  it('affiche une alerte d\'erreur quand le chargement échoue', async () => {
    getCatalogues.mockRejectedValue(new Error('boom'));

    renderWithProviders(<CataloguesPage />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/erreur lors du chargement des catalogues/i)).toBeInTheDocument();
  });

  it('ouvre le dialog de création au clic sur « Créer un catalogue »', async () => {
    getCatalogues.mockResolvedValue({ data: [makeCatalogue()] });
    const user = userEvent.setup();

    renderWithProviders(<CataloguesPage />);

    await screen.findByText('Catalogue agents de sécurité');
    // Le bouton d'en-tête ouvre le dialog.
    await user.click(screen.getByRole('button', { name: /créer un catalogue/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/créer un nouveau catalogue/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/titre du catalogue/i)).toBeInTheDocument();
    // L'ouverture déclenche le chargement automatique de tous les candidats.
    await waitFor(() => expect(getCandidates).toHaveBeenCalled());
  });

  it('supprime un catalogue après confirmation', async () => {
    getCatalogues.mockResolvedValue({ data: [makeCatalogue()] });
    vi.mocked(catalogueService.deleteCatalogue).mockResolvedValue({ success: true });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<CataloguesPage />);

    await screen.findByText('Catalogue agents de sécurité');
    await user.click(screen.getByRole('button', { name: /supprimer/i }));

    expect(confirmSpy).toHaveBeenCalled();
    // TanStack Query peut passer un 2e argument (contexte) au mutationFn → on
    // vérifie uniquement que l'id du catalogue est bien transmis.
    await waitFor(() =>
      expect(vi.mocked(catalogueService.deleteCatalogue).mock.calls[0]?.[0]).toBe('cat-1')
    );
    confirmSpy.mockRestore();
  });
});
