import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';
import CartBadge from './CartBadge';
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

describe('CartBadge', () => {
  let fetchWishlist: ReturnType<typeof vi.fn>;
  let openDrawer: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchWishlist = vi.fn().mockResolvedValue(undefined);
    openDrawer = vi.fn();

    // État du store contrôlé directement (pas d'appel réseau réel).
    useWishlistStore.setState({
      wishlist: null,
      fetchWishlist: fetchWishlist as unknown as (accessToken: string) => Promise<void>,
      openDrawer,
    });
    useClientAuthStore.setState({ accessToken: null });
  });

  it('affiche un badge vide (0) et masque la puce de total quand le panier est vide', () => {
    renderWithProviders(<CartBadge />);

    // Le bouton du panier est présent et cliquable.
    expect(screen.getByRole('button')).toBeInTheDocument();
    // Badge MUI à 0 : la pastille est masquée → "0" n'est pas dans le DOM visible.
    expect(screen.queryByText(/\$$/)).not.toBeInTheDocument();
    // Aucune puce de total tant que le panier est vide.
    expect(screen.queryByText('0.00$')).not.toBeInTheDocument();
  });

  it('agrège les quantités dans le badge et affiche le total formaté', () => {
    useWishlistStore.setState({
      wishlist: makeWishlist({
        totalAmount: 350.5,
        items: [
          makeItem({ id: 'a', quantity: 2 }),
          makeItem({ id: 'b', quantity: 3 }),
        ],
      }),
    });

    renderWithProviders(<CartBadge />);

    // 2 + 3 = 5 articles → badge.
    expect(screen.getByText('5')).toBeInTheDocument();
    // Total formaté à 2 décimales avec le symbole $ (puce de total).
    expect(screen.getByText('350.50$')).toBeInTheDocument();
  });

  it('plafonne le badge à 99+ au-delà de 99 articles', () => {
    useWishlistStore.setState({
      wishlist: makeWishlist({
        totalAmount: 10,
        items: [makeItem({ id: 'big', quantity: 150 })],
      }),
    });

    renderWithProviders(<CartBadge />);

    // max=99 sur le Badge MUI → affichage "99+".
    expect(screen.getByText('99+')).toBeInTheDocument();
    expect(screen.queryByText('150')).not.toBeInTheDocument();
  });

  it('ouvre le tiroir via openDrawer au clic sur le bouton du panier', async () => {
    renderWithProviders(<CartBadge />);

    await userEvent.click(screen.getByRole('button'));

    expect(openDrawer).toHaveBeenCalledTimes(1);
  });

  it('charge le panier au montage uniquement quand un accessToken est présent', async () => {
    // Sans token : aucun fetch.
    const { unmount } = renderWithProviders(<CartBadge />);
    expect(fetchWishlist).not.toHaveBeenCalled();
    unmount();

    // Avec token : fetch déclenché avec le token.
    useClientAuthStore.setState({ accessToken: 'tok-123' });
    renderWithProviders(<CartBadge />);

    await waitFor(() => expect(fetchWishlist).toHaveBeenCalledTimes(1));
    expect(fetchWishlist).toHaveBeenCalledWith('tok-123');
  });

  it('affiche le détail du panier (articles + total) dans l\'infobulle au survol', async () => {
    useWishlistStore.setState({
      wishlist: makeWishlist({
        totalAmount: 100,
        items: [makeItem({ id: 'one', quantity: 1 })],
      }),
    });

    renderWithProviders(<CartBadge />);

    await userEvent.hover(screen.getByRole('button'));

    const tooltip = await screen.findByRole('tooltip');
    expect(within(tooltip).getByText('Mon Panier')).toBeInTheDocument();
    // Singulier : "1 article" (sans "s").
    expect(within(tooltip).getByText('1 article')).toBeInTheDocument();
    expect(within(tooltip).getByText('Total: 100.00$')).toBeInTheDocument();
  });
});
