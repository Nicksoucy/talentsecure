import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';
import CartDrawer from './CartDrawer';
import { useWishlistStore, type Wishlist, type WishlistItem } from '@/store/wishlistStore';
import { useClientAuthStore } from '@/store/clientAuthStore';

const makeItem = (overrides: Partial<WishlistItem> = {}): WishlistItem => ({
  id: 'item-1',
  wishlistId: 'wl-1',
  city: 'Montréal',
  province: 'QC',
  type: 'EVALUATED',
  quantity: 1,
  unitPrice: 100,
  totalPrice: 100,
  createdAt: '2026-06-20T00:00:00.000Z',
  updatedAt: '2026-06-20T00:00:00.000Z',
  ...overrides,
});

const makeWishlist = (overrides: Partial<Wishlist> = {}): Wishlist => ({
  id: 'wl-1',
  clientId: 'client-1',
  status: 'DRAFT',
  totalAmount: 0,
  createdAt: '2026-06-20T00:00:00.000Z',
  updatedAt: '2026-06-20T00:00:00.000Z',
  items: [],
  ...overrides,
});

describe('CartDrawer', () => {
  let closeDrawer: ReturnType<typeof vi.fn>;
  let updateItem: ReturnType<typeof vi.fn>;
  let removeItem: ReturnType<typeof vi.fn>;
  let clearWishlist: ReturnType<typeof vi.fn>;
  let submitWishlist: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    closeDrawer = vi.fn();
    updateItem = vi.fn().mockResolvedValue(undefined);
    removeItem = vi.fn().mockResolvedValue(undefined);
    clearWishlist = vi.fn().mockResolvedValue(undefined);
    submitWishlist = vi.fn().mockResolvedValue(undefined);

    // État du store contrôlé directement : tiroir ouvert, aucune action réseau réelle.
    useWishlistStore.setState({
      drawerOpen: true,
      isLoading: false,
      wishlist: null,
      closeDrawer,
      updateItem: updateItem as unknown as (a: string, i: string, q: number) => Promise<void>,
      removeItem: removeItem as unknown as (a: string, i: string) => Promise<void>,
      clearWishlist: clearWishlist as unknown as (a: string) => Promise<void>,
      submitWishlist: submitWishlist as unknown as (a: string) => Promise<void>,
    });
    useClientAuthStore.setState({ accessToken: 'tok-123' });
  });

  it('affiche le titre et l\'état vide quand le panier ne contient aucun article', () => {
    renderWithProviders(<CartDrawer />);

    expect(screen.getByText('Mon Panier')).toBeInTheDocument();
    expect(screen.getByText('Votre panier est vide')).toBeInTheDocument();
    // Aucune action de soumission tant que le panier est vide.
    expect(screen.queryByRole('button', { name: /Soumettre la demande/ })).not.toBeInTheDocument();
  });

  it('ne rend pas le contenu du tiroir quand drawerOpen est false', () => {
    useWishlistStore.setState({ drawerOpen: false });
    renderWithProviders(<CartDrawer />);

    expect(screen.queryByText('Mon Panier')).not.toBeInTheDocument();
    expect(screen.queryByText('Votre panier est vide')).not.toBeInTheDocument();
  });

  it('affiche les articles, le total estimé et l\'agrégat de quantités', () => {
    useWishlistStore.setState({
      wishlist: makeWishlist({
        totalAmount: 500,
        items: [
          makeItem({ id: 'a', city: 'Montréal', quantity: 2, unitPrice: 100, totalPrice: 200 }),
          makeItem({ id: 'b', city: 'Québec', quantity: 3, unitPrice: 100, totalPrice: 300 }),
        ],
      }),
    });

    renderWithProviders(<CartDrawer />);

    // Total estimé formaté.
    expect(screen.getByText('500.00$')).toBeInTheDocument();
    // 2 + 3 = 5 articles agrégés (apparaît dans l'en-tête et la barre de total).
    expect(screen.getAllByText(/5 articles/).length).toBeGreaterThan(0);
    // Les villes des deux articles sont rendues.
    expect(screen.getByText('Montréal, QC')).toBeInTheDocument();
    expect(screen.getByText('Québec, QC')).toBeInTheDocument();
    // Bouton de soumission avec le montant.
    expect(screen.getByRole('button', { name: /Soumettre la demande \(500\.00\$\)/ })).toBeInTheDocument();
  });

  it('soumet la demande puis ferme le tiroir', async () => {
    const user = userEvent.setup();
    useWishlistStore.setState({
      wishlist: makeWishlist({
        totalAmount: 100,
        items: [makeItem({ id: 'one', quantity: 1, totalPrice: 100 })],
      }),
    });

    renderWithProviders(<CartDrawer />);

    await user.click(screen.getByRole('button', { name: /Soumettre la demande/ }));

    await waitFor(() => expect(submitWishlist).toHaveBeenCalledTimes(1));
    expect(submitWishlist).toHaveBeenCalledWith('tok-123');
    await waitFor(() => expect(closeDrawer).toHaveBeenCalledTimes(1));
  });

  it('augmente la quantité d\'un article via le bouton +', async () => {
    const user = userEvent.setup();
    useWishlistStore.setState({
      wishlist: makeWishlist({
        totalAmount: 100,
        items: [makeItem({ id: 'one', quantity: 2, unitPrice: 100, totalPrice: 200 })],
      }),
    });

    renderWithProviders(<CartDrawer />);

    // Le bouton "+" (AddIcon) n'a pas de libellé textuel : on le repère via la quantité affichée à côté.
    const quantityCell = screen.getByText('2');
    // Le conteneur du contrôle de quantité contient les boutons +/-.
    const controls = quantityCell.closest('div')?.parentElement as HTMLElement;
    const buttons = within(controls).getAllByRole('button');
    // Ordre : [-], [zone quantité (non bouton)], [+] → dernier bouton = "+".
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1));
    // currentQuantity (2) + change (1) = 3.
    expect(updateItem).toHaveBeenCalledWith('tok-123', 'one', 3);
  });

  it('vide le panier après confirmation et déclenche clearWishlist', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    useWishlistStore.setState({
      wishlist: makeWishlist({
        totalAmount: 100,
        items: [makeItem({ id: 'one', quantity: 1, totalPrice: 100 })],
      }),
    });

    renderWithProviders(<CartDrawer />);

    await user.click(screen.getByRole('button', { name: /Vider le panier/ }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(clearWishlist).toHaveBeenCalledTimes(1));
    expect(clearWishlist).toHaveBeenCalledWith('tok-123');

    confirmSpy.mockRestore();
  });

  it('masque les contrôles d\'édition et affiche un avis quand la demande est soumise (non DRAFT)', () => {
    useWishlistStore.setState({
      wishlist: makeWishlist({
        status: 'SUBMITTED',
        totalAmount: 100,
        items: [makeItem({ id: 'one', quantity: 4, totalPrice: 400 })],
      }),
    });

    renderWithProviders(<CartDrawer />);

    // Avis d'immuabilité affiché.
    expect(screen.getByText(/ne peut plus être modifiée/)).toBeInTheDocument();
    // La quantité est affichée en lecture seule, pas via les contrôles +/-.
    expect(screen.getByText('Quantité: 4')).toBeInTheDocument();
    // Aucune action de soumission ni de vidage : le footer DRAFT est masqué.
    expect(screen.queryByRole('button', { name: /Soumettre la demande/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Vider le panier/ })).not.toBeInTheDocument();
  });
});
