import axios from 'axios';
import { ClientUser } from '@/store/clientAuthStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Create axios instance for client auth (without interceptors)
const clientApi = axios.create({
  baseURL: API_URL,
});

interface LoginCredentials {
  email: string;
  password: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface Catalogue {
  id: string;
  title: string;
  status: string;
  customMessage?: string;
  requiresPayment: boolean;
  isPaid: boolean;
  isContentRestricted: boolean;
  createdAt: string;
  items: Array<{
    id: string;
    order: number;
    candidate: {
      id: string;
      firstName: string;
      lastName: string;
      city: string;
      province: string;
      status: string;
      globalRating?: number;
    };
  }>;
}

export interface CatalogueDetail extends Catalogue {
  items: Array<{
    id: string;
    order: number;
    candidate: {
      id: string;
      firstName: string;
      lastName: string;
      city: string;
      province: string;
      status: string;
      globalRating?: number;
      phone?: string | null;
      email?: string | null;
      videoUrl?: string | null;
      cvUrl?: string | null;
      languages?: Array<{
        language: string;
        level: string;
      }>;
      experiences?: Array<{
        companyName: string;
        position: string;
        durationMonths?: number;
      }>;
      availabilities?: Array<{
        type: string;
        isAvailable: boolean;
      }>;
      certifications?: Array<{
        name: string;
        expiryDate?: string;
      }>;
    };
  }>;
}

export const clientAuthService = {
  /**
   * Client login with email/password
   */
  async login(credentials: LoginCredentials): Promise<{ client: ClientUser } & AuthTokens> {
    const response = await clientApi.post('/api/client-auth/login', credentials);
    return response.data;
  },

  /**
   * Get current client profile
   */
  async getProfile(accessToken: string): Promise<{ client: ClientUser }> {
    const response = await clientApi.get('/api/client-auth/profile', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data;
  },

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    const response = await clientApi.post('/api/client-auth/refresh', { refreshToken });
    return response.data;
  },

  /**
   * Get all catalogues for current client
   */
  async getCatalogues(accessToken: string): Promise<Catalogue[]> {
    const response = await clientApi.get('/api/client-auth/catalogues', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data;
  },

  /**
   * Get single catalogue by ID
   */
  async getCatalogueById(id: string, accessToken: string): Promise<CatalogueDetail> {
    const response = await clientApi.get(`/api/client-auth/catalogues/${id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data;
  },
};
