import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export interface WishlistItem {
  id: string;
  wishlistId: string;
  city: string;
  province: string;
  type: 'EVALUATED' | 'CV_ONLY';
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
}

export interface Wishlist {
  id: string;
  clientId: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID' | 'DELIVERED' | 'CANCELLED';
  totalAmount: number;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
  client: {
    id: string;
    name: string;
    companyName?: string;
    email: string;
    phone?: string;
    address?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    billingEmail?: string;
    defaultPricePerCandidate?: number;
    discountPercent?: number;
  };
  items: WishlistItem[];
  _count?: {
    items: number;
  };
}

export interface WishlistStats {
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  paid: number;
  delivered: number;
  cancelled: number;
  totalRevenue: number;
  pendingRevenue: number;
}

export interface GetAllWishlistsResponse {
  wishlists: Wishlist[];
  stats: WishlistStats;
  count: number;
}

export interface GetAllWishlistsParams {
  status?: string;
  clientId?: string;
  startDate?: string;
  endDate?: string;
}

class WishlistAdminService {
  /**
   * Get all wishlists (Admin only)
   */
  async getAllWishlists(
    accessToken: string,
    params?: GetAllWishlistsParams
  ): Promise<GetAllWishlistsResponse> {
    const response = await axios.get(`${API_URL}/wishlist/admin/all`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params,
    });
    return response.data;
  }

  /**
   * Get single wishlist by ID (Admin only)
   */
  async getWishlistById(accessToken: string, id: string): Promise<{ wishlist: Wishlist }> {
    const response = await axios.get(`${API_URL}/wishlist/admin/${id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data;
  }

  /**
   * Update wishlist status (Admin only)
   */
  async updateWishlistStatus(
    accessToken: string,
    id: string,
    status: Wishlist['status'],
    adminNotes?: string
  ): Promise<{ message: string; wishlist: Wishlist }> {
    const response = await axios.put(
      `${API_URL}/wishlist/admin/${id}/status`,
      { status, adminNotes },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return response.data;
  }

  /**
   * Cancel/Delete wishlist (Admin only)
   */
  async deleteWishlist(
    accessToken: string,
    id: string
  ): Promise<{ message: string; wishlist: Wishlist }> {
    const response = await axios.delete(`${API_URL}/wishlist/admin/${id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data;
  }
}

export const wishlistAdminService = new WishlistAdminService();
