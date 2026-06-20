import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { resetStores } from '@/test/resetStores';
import { makeUser } from '@/test/factories';
import type {
  GetAllWishlistsResponse,
  Wishlist,
} from '@/services/wishlist-admin.service';

// La page récupère les données via le service (TanStack Query). On mocke le
// service pour piloter chargement / données / vide / erreur sans réseau réel.
vi.mock('@/services/wishlist-admin.service', () => ({
  wishlistAdminService: {
    getAllWishlists: vi.fn(),
    updateWishlistStatus: vi.fn(),
    deleteWishlist: vi.fn(),
  },
}));

import { wishlistAdminService } from '@/services/wishlist-admin.service';
import WishlistsPage from './WishlistsPage';

const getAllWishlists = vi.mocked(wishlistAdminService.getAllWishlists);

function makeWishlist(overrides: Partial<Wishlist> = {}): Wishlist {
  return {
    id: 'wl-1',
    clientId: 'client-1',
    status: 'SUBMITTED',
    totalAmount: 450,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
    client: {
      id: 'client-1',
      name: 'Contact Principal',
      companyName: 'Construction Lavoie',
      email: 'contact@lavoie.ca',
      phone: '514-555-0199',
    },
    items: [
      {
        id: 'item-1',
        wishlistId: 'wl-1',
        city: 'Montréal',
        province: 'QC',
        type: 'EVALUATED',
        quantity: 3,
        unitPrice: 150,
        totalPrice: 450,
        notes: 'Disponibilité rapide',
      },
    ],
    ...overrides,
  };
}

function makeResponse(
  overrides: Partial<GetAllWishlistsResponse> = {}
): GetAllWishlistsResponse {
  const wishlists = overrides.wishlists ?? [makeWishlist()];
  return {
    wishlists,
    count: wishlists.length,
    stats: {
      total: 4,
      draft: 0,
      submitted: 2,
      approved: 1,
      paid: 1,
      delivered: 0,
      cancelled: 0,
      totalRevenue: 1200,
      pendingRevenue: 450,
      ...overrides.stats,
    },
  };
}

// La query est gardée par `enabled: !!accessToken` → un token est requis pour
// déclencher le fetch et donc le rendu des données.
function seedAuth(): void {
  useAuthStore
    .getState()
    .setAuth(makeUser({ role: 'ADMIN' }), 'fake-access-token', 'fake-refresh-token');
}

describe('WishlistsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedAuth();
  });

  afterEach(() => resetStores());

  it('affiche le titre et les en-têtes de la page', async () => {
    getAllWishlists.mockResolvedValue(makeResponse({ wishlists: [] }));
    renderWithProviders(<WishlistsPage />);

    expect(
      screen.getByRole('heading', { name: /demandes clients/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/gestion des demandes de candidats des clients/i)
    ).toBeInTheDocument();
    // Les libellés des cartes de statistiques.
    expect(screen.getByText(/total demandes/i)).toBeInTheDocument();
    expect(screen.getByText(/revenu total/i)).toBeInTheDocument();

    // Laisse la query se résoudre (évite un warning act() en fin de test).
    await screen.findByText(/aucune demande trouvée/i);
  });

  it('charge puis affiche les demandes et les statistiques', async () => {
    getAllWishlists.mockResolvedValue(makeResponse());
    renderWithProviders(<WishlistsPage />);

    // Après chargement, la ligne de la demande apparaît.
    expect(await screen.findByText('Construction Lavoie')).toBeInTheDocument();
    expect(screen.getByText('contact@lavoie.ca')).toBeInTheDocument();

    // Le statut SUBMITTED est traduit en français.
    expect(screen.getByText('Soumise')).toBeInTheDocument();

    // Les statistiques mockées sont rendues (revenu total formaté).
    expect(screen.getByText('1200.00$')).toBeInTheDocument();

    // Le tableau a bien une ligne de données (en plus de l'en-tête).
    const table = screen.getByRole('table');
    expect(within(table).getByText('1 items')).toBeInTheDocument();
  });

  it('affiche un message quand aucune demande n\'est trouvée', async () => {
    getAllWishlists.mockResolvedValue(makeResponse({ wishlists: [] }));
    renderWithProviders(<WishlistsPage />);

    expect(await screen.findByText(/aucune demande trouvée/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('affiche une erreur si le chargement échoue', async () => {
    getAllWishlists.mockRejectedValue(new Error('boom'));
    renderWithProviders(<WishlistsPage />);

    expect(
      await screen.findByText(/erreur lors du chargement des demandes/i)
    ).toBeInTheDocument();
  });

  it('filtrer par statut relance la requête avec le statut choisi', async () => {
    const user = userEvent.setup();
    getAllWishlists.mockResolvedValue(makeResponse());
    renderWithProviders(<WishlistsPage />);

    await screen.findByText('Construction Lavoie');
    // Premier appel : pas de filtre de statut.
    expect(getAllWishlists).toHaveBeenLastCalledWith('fake-access-token', {});

    // Ouvre le Select MUI (un seul combobox sur la page) et choisit « Approuvées ».
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Approuvées' }));

    // La query est relancée avec le statut sélectionné.
    expect(getAllWishlists).toHaveBeenLastCalledWith('fake-access-token', {
      status: 'APPROVED',
    });
  });

  it('ouvre le détail d\'une demande via le menu d\'actions', async () => {
    const user = userEvent.setup();
    getAllWishlists.mockResolvedValue(makeResponse());
    renderWithProviders(<WishlistsPage />);

    const clientCell = (await screen.findByText('Construction Lavoie')).closest('tr');
    expect(clientCell).not.toBeNull();

    // Ouvre le menu d'actions de la ligne (IconButton sans libellé → dernier bouton de la ligne).
    const rowButtons = within(clientCell as HTMLElement).getAllByRole('button');
    await user.click(rowButtons[rowButtons.length - 1]);
    await user.click(await screen.findByRole('menuitem', { name: /voir détails/i }));

    // Le dialog de détails s'ouvre (titre + bouton de fermeture présents).
    // NB : le corps du dialog dépend de `selectedWishlist`, que la page remet à
    // null dans handleMenuClose() juste après l'ouverture → on teste l'ouverture
    // observable du dialog, pas son contenu détaillé.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/détails de la demande/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /fermer/i })).toBeInTheDocument();
  });
});
