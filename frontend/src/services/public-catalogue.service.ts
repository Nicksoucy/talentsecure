import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Create axios instance without auth for public endpoints
const publicApi = axios.create({
  baseURL: API_URL,
});

export interface PublicCatalogue {
  id: string;
  title: string;
  customMessage?: string;
  status: string;
  isContentRestricted: boolean;
  requiresPayment: boolean;
  isPaid: boolean;
  client: {
    id: string;
    name: string;
    companyName?: string;
  };
  items: {
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
  }[];
}

export const publicCatalogueService = {
  /**
   * Get catalogue by share token (public access)
   */
  getCatalogueByToken: async (token: string): Promise<PublicCatalogue> => {
    const response = await publicApi.get(`/api/catalogues/view/${token}`);
    return response.data;
  },
};
