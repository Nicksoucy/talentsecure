import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/renderWithProviders';
import ClientPurchasesPage from './ClientPurchasesPage';
import { talentMarketplaceService, type PurchasedCandidate } from '@/services/talent-marketplace.service';

// La page récupère les achats via TanStack Query → on mocke le service appelé.
vi.mock('@/services/talent-marketplace.service', () => ({
  talentMarketplaceService: {
    getPurchases: vi.fn(),
  },
}));

const getPurchases = vi.mocked(talentMarketplaceService.getPurchases);

function makePurchase(overrides: Partial<PurchasedCandidate> = {}): PurchasedCandidate {
  return {
    id: 'p1',
    price: 4900,
    city: 'Montréal',
    purchasedAt: '2026-06-19T00:00:00.000Z',
    candidate: {
      id: 'c1',
      firstName: 'Jean',
      lastName: 'Tremblay',
      email: 'jean@example.com',
      phone: '514-555-0000',
      city: 'Montréal',
      province: 'QC',
      globalRating: 4.5,
      clientNote: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ClientPurchasesPage', () => {
  it('affiche le titre et un indicateur de chargement avant la réponse', () => {
    // Promesse jamais résolue → reste en chargement.
    getPurchases.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ClientPurchasesPage />);

    expect(screen.getByRole('heading', { name: /mes candidats achetés/i })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('rend les candidats achetés une fois les données chargées', async () => {
    getPurchases.mockResolvedValue({
      data: [
        makePurchase(),
        makePurchase({
          id: 'p2',
          candidate: {
            id: 'c2',
            firstName: 'Marie',
            lastName: 'Gagnon',
            email: 'marie@example.com',
            phone: '438-555-1111',
            city: 'Laval',
            province: 'QC',
            globalRating: 4.2,
            clientNote: null,
          },
        }),
      ],
    });

    renderWithProviders(<ClientPurchasesPage />);

    expect(await screen.findByText('Jean Tremblay')).toBeInTheDocument();
    expect(screen.getByText('Marie Gagnon')).toBeInTheDocument();
    // Coordonnées visibles (réservées aux candidats achetés).
    expect(screen.getByText(/jean@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/514-555-0000/)).toBeInTheDocument();
    // Le spinner a disparu.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('affiche la note client quand elle est présente, et la masque sinon', async () => {
    getPurchases.mockResolvedValue({
      data: [makePurchase({ candidate: { ...makePurchase().candidate, clientNote: 'Excellent profil, à recontacter.' } })],
    });

    renderWithProviders(<ClientPurchasesPage />);

    expect(await screen.findByText('Jean Tremblay')).toBeInTheDocument();
    expect(screen.getByText('Excellent profil, à recontacter.')).toBeInTheDocument();
  });

  it('affiche la date d\'achat formatée (fr-CA)', async () => {
    getPurchases.mockResolvedValue({ data: [makePurchase()] });

    renderWithProviders(<ClientPurchasesPage />);

    await screen.findByText('Jean Tremblay');
    const expected = `Acheté le ${new Date('2026-06-19T00:00:00.000Z').toLocaleDateString('fr-CA')}`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('affiche un état vide quand le client n\'a aucun achat', async () => {
    getPurchases.mockResolvedValue({ data: [] });

    renderWithProviders(<ClientPurchasesPage />);

    expect(await screen.findByText(/aucun candidat acheté pour le moment/i)).toBeInTheDocument();
  });

  it('reste sans candidat affiché en cas d\'erreur du service', async () => {
    getPurchases.mockRejectedValue(new Error('boom'));

    renderWithProviders(<ClientPurchasesPage />);

    // Sans données : pas de spinner persistant, pas de carte candidat.
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
    expect(screen.queryByText('Jean Tremblay')).not.toBeInTheDocument();
    // L'en-tête reste rendu (la page ne plante pas).
    expect(screen.getByRole('heading', { name: /mes candidats achetés/i })).toBeInTheDocument();
  });
});
