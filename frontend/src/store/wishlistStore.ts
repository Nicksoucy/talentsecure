import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export type CandidateType = 'EVALUATED' | 'CV_ONLY';
export type WishlistStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID' | 'DELIVERED' | 'CANCELLED';

export interface WishlistItem {
  id: string;
  wishlistId: string;
  city: string;
  province: string;
  type: CandidateType;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Wishlist {
  id: string;
  clientId: string;
  status: WishlistStatus;
  totalAmount: number;
  submittedAt?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
  items: WishlistItem[];
}

export interface CityPricing {
  id: string;
  city: string;
  province: string;
  evaluatedCandidateMinPrice: number;
  evaluatedCandidateMaxPrice: number;
  evaluatedCandidatePrice: number;
  cvOnlyMinPrice: number;
  cvOnlyMaxPrice: number;
  cvOnlyPrice: number;
  priceMultiplier: number;
}

interface WishlistStore {
  wishlist: Wishlist | null;
  isLoading: boolean;
  error: string | null;
  drawerOpen: boolean;

  // Actions
  fetchWishlist: (accessToken: string) => Promise<void>;
  addItem: (accessToken: string, item: {
    city: string;
    province?: string;
    type: CandidateType;
    quantity: number;
    notes?: string;
  }) => Promise<void>;
  updateItem: (accessToken: string, itemId: string, quantity: number) => Promise<void>;
  removeItem: (accessToken: string, itemId: string) => Promise<void>;
  clearWishlist: (accessToken: string) => Promise<void>;
  submitWishlist: (accessToken: string) => Promise<void>;
  getCityPricing: (accessToken: string, city: string) => Promise<CityPricing>;
  getAvailableCount: (accessToken: string, city: string) => Promise<{
    evaluated: number;
    cvOnly: number;
  }>;

  // UI Actions
  openDrawer: () => void;
  closeDrawer: () => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useWishlistStore = create<WishlistStore>()(
  persist(
    (set, get) => ({
      wishlist: null,
      isLoading: false,
      error: null,
      drawerOpen: false,

      fetchWishlist: async (accessToken: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axios.get(`${API_URL}/api/wishlist`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
          set({ wishlist: response.data.wishlist, isLoading: false });
        } catch (error: any) {
          const errorMsg = error.response?.data?.error || 'Erreur lors du chargement du panier';
          set({ error: errorMsg, isLoading: false });
          throw error;
        }
      },

      addItem: async (accessToken: string, item) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axios.post(
            `${API_URL}/api/wishlist/items`,
            item,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );
          set({ wishlist: response.data.wishlist, isLoading: false });
        } catch (error: any) {
          const errorMsg = error.response?.data?.error || "Erreur lors de l'ajout au panier";
          set({ error: errorMsg, isLoading: false });
          throw error;
        }
      },

      updateItem: async (accessToken: string, itemId: string, quantity: number) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axios.put(
            `${API_URL}/api/wishlist/items/${itemId}`,
            { quantity },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );
          set({ wishlist: response.data.wishlist, isLoading: false });
        } catch (error: any) {
          const errorMsg = error.response?.data?.error || "Erreur lors de la mise à jour";
          set({ error: errorMsg, isLoading: false });
          throw error;
        }
      },

      removeItem: async (accessToken: string, itemId: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axios.delete(
            `${API_URL}/api/wishlist/items/${itemId}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );
          set({ wishlist: response.data.wishlist, isLoading: false });
        } catch (error: any) {
          const errorMsg = error.response?.data?.error || 'Erreur lors de la suppression';
          set({ error: errorMsg, isLoading: false });
          throw error;
        }
      },

      clearWishlist: async (accessToken: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axios.delete(`${API_URL}/api/wishlist`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
          set({ wishlist: response.data.wishlist, isLoading: false });
        } catch (error: any) {
          const errorMsg = error.response?.data?.error || 'Erreur lors du vidage du panier';
          set({ error: errorMsg, isLoading: false });
          throw error;
        }
      },

      submitWishlist: async (accessToken: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axios.post(
            `${API_URL}/api/wishlist/submit`,
            {},
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );
          set({ wishlist: response.data.wishlist, isLoading: false });
        } catch (error: any) {
          const errorMsg = error.response?.data?.error || 'Erreur lors de la soumission';
          set({ error: errorMsg, isLoading: false });
          throw error;
        }
      },

      getCityPricing: async (accessToken: string, city: string) => {
        try {
          const response = await axios.get(
            `${API_URL}/api/wishlist/pricing/${city}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );
          return response.data.pricing;
        } catch (error: any) {
          const errorMsg = error.response?.data?.error || 'Erreur lors du chargement des prix';
          set({ error: errorMsg });
          throw error;
        }
      },

      getAvailableCount: async (accessToken: string, city: string) => {
        try {
          const response = await axios.get(
            `${API_URL}/api/wishlist/available/${city}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );
          return response.data.available;
        } catch (error: any) {
          const errorMsg = error.response?.data?.error || 'Erreur lors du chargement de la disponibilité';
          set({ error: errorMsg });
          throw error;
        }
      },

      openDrawer: () => set({ drawerOpen: true }),
      closeDrawer: () => set({ drawerOpen: false }),
      setError: (error: string | null) => set({ error }),
      reset: () => set({ wishlist: null, error: null, isLoading: false, drawerOpen: false }),
    }),
    {
      name: 'wishlist-storage',
      partialize: (state) => ({
        wishlist: state.wishlist,
      }),
    }
  )
);
