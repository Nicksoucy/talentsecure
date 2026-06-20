import { describe, it, expect, beforeEach, vi } from 'vitest';

// On mocke entièrement le client axios : le store appelle clientApi.{get,post,put,delete}.
// Aucun réseau réel — on contrôle les réponses et on inspecte les arguments.
vi.mock('../services/clientApi', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import clientApi from '../services/clientApi';
import { useWishlistStore, type Wishlist, type CityPricing } from './wishlistStore';

const mockedApi = clientApi as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const fakeWishlist: Wishlist = {
  id: 'wl-1',
  clientId: 'client-1',
  status: 'DRAFT',
  totalAmount: 1500,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  items: [
    {
      id: 'item-1',
      wishlistId: 'wl-1',
      city: 'Montréal',
      province: 'QC',
      type: 'EVALUATED',
      quantity: 2,
      unitPrice: 750,
      totalPrice: 1500,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  ],
};

const ACCESS_TOKEN = 'client-access-token';

describe('useWishlistStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Remise à l'état initial avant chaque test (le store est un singleton module-level).
    useWishlistStore.getState().reset();
  });

  it('reset ramène le store à son état initial vide', () => {
    // On salit l'état au préalable
    useWishlistStore.setState({
      wishlist: fakeWishlist,
      error: 'boom',
      isLoading: true,
      drawerOpen: true,
    });

    useWishlistStore.getState().reset();

    const state = useWishlistStore.getState();
    expect(state.wishlist).toBeNull();
    expect(state.error).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.drawerOpen).toBe(false);
  });

  it('openDrawer / closeDrawer pilotent le tiroir sans toucher au reste de l’état', () => {
    useWishlistStore.getState().openDrawer();
    expect(useWishlistStore.getState().drawerOpen).toBe(true);

    useWishlistStore.getState().closeDrawer();
    expect(useWishlistStore.getState().drawerOpen).toBe(false);
    // Aucune action UI ne doit déclencher de requête réseau
    expect(mockedApi.get).not.toHaveBeenCalled();
  });

  it('fetchWishlist charge le panier depuis response.data.wishlist et solde isLoading', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { wishlist: fakeWishlist } });

    await useWishlistStore.getState().fetchWishlist(ACCESS_TOKEN);

    expect(mockedApi.get).toHaveBeenCalledWith('/api/wishlist');
    const state = useWishlistStore.getState();
    expect(state.wishlist).toEqual(fakeWishlist);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('addItem poste l’item, met à jour le panier et envoie le bon corps', async () => {
    const updated: Wishlist = { ...fakeWishlist, totalAmount: 2250 };
    mockedApi.post.mockResolvedValueOnce({ data: { wishlist: updated } });

    const payload = {
      city: 'Québec',
      province: 'QC',
      type: 'CV_ONLY' as const,
      quantity: 3,
      notes: 'urgent',
    };

    await useWishlistStore.getState().addItem(ACCESS_TOKEN, payload);

    expect(mockedApi.post).toHaveBeenCalledWith('/api/wishlist/items', payload);
    expect(useWishlistStore.getState().wishlist).toEqual(updated);
    expect(useWishlistStore.getState().isLoading).toBe(false);
  });

  it('addItem en échec mappe le message d’erreur du backend et relance', async () => {
    mockedApi.post.mockRejectedValueOnce({
      response: { data: { message: 'Ville indisponible' } },
    });

    await expect(
      useWishlistStore.getState().addItem(ACCESS_TOKEN, {
        city: 'Gaspé',
        type: 'EVALUATED',
        quantity: 1,
      })
    ).rejects.toBeDefined();

    const state = useWishlistStore.getState();
    expect(state.error).toBe('Ville indisponible');
    expect(state.isLoading).toBe(false);
    // Le panier ne doit pas être écrasé en cas d'échec
    expect(state.wishlist).toBeNull();
  });

  it('fetchWishlist en échec utilise le message par défaut quand le backend n’en fournit pas', async () => {
    mockedApi.get.mockRejectedValueOnce(new Error('network down'));

    await expect(
      useWishlistStore.getState().fetchWishlist(ACCESS_TOKEN)
    ).rejects.toThrow('network down');

    const state = useWishlistStore.getState();
    expect(state.error).toBe('Erreur lors du chargement du panier');
    expect(state.isLoading).toBe(false);
  });

  it('getCityPricing renvoie response.data.pricing sans modifier le panier', async () => {
    const pricing: CityPricing = {
      id: 'price-1',
      city: 'Montréal',
      province: 'QC',
      evaluatedCandidateMinPrice: 600,
      evaluatedCandidateMaxPrice: 900,
      evaluatedCandidatePrice: 750,
      cvOnlyMinPrice: 100,
      cvOnlyMaxPrice: 300,
      cvOnlyPrice: 200,
      priceMultiplier: 1,
    };
    mockedApi.get.mockResolvedValueOnce({ data: { pricing } });

    const result = await useWishlistStore.getState().getCityPricing(ACCESS_TOKEN, 'Montréal');

    expect(mockedApi.get).toHaveBeenCalledWith('/api/wishlist/pricing/Montréal');
    expect(result).toEqual(pricing);
    // getCityPricing ne touche pas isLoading ni le panier
    expect(useWishlistStore.getState().wishlist).toBeNull();
    expect(useWishlistStore.getState().isLoading).toBe(false);
  });
});
