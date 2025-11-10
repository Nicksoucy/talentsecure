import api from './api';
import { ProspectCandidate } from '@/types';

interface GetProspectsParams {
  search?: string;
  city?: string;
  isContacted?: boolean;
  isConverted?: boolean;
  submissionDateStart?: string;
  submissionDateEnd?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface ProspectsResponse {
  data: ProspectCandidate[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const prospectService = {
  /**
   * Get all prospects with filters
   */
  async getProspects(params?: GetProspectsParams): Promise<ProspectsResponse> {
    const response = await api.get('/api/prospects', { params });
    return response.data;
  },

  /**
   * Get single prospect by ID
   */
  async getProspectById(id: string): Promise<{ data: ProspectCandidate }> {
    const response = await api.get(`/api/prospects/${id}`);
    return response.data;
  },

  /**
   * Create new prospect
   */
  async createProspect(data: any): Promise<{ data: ProspectCandidate; message: string }> {
    const response = await api.post('/api/prospects', data);
    return response.data;
  },

  /**
   * Update prospect
   */
  async updateProspect(id: string, data: any): Promise<{ data: ProspectCandidate; message: string }> {
    const response = await api.put(`/api/prospects/${id}`, data);
    return response.data;
  },

  /**
   * Delete prospect
   */
  async deleteProspect(id: string): Promise<{ message: string }> {
    const response = await api.delete(`/api/prospects/${id}`);
    return response.data;
  },

  /**
   * Mark prospect as contacted
   */
  async markAsContacted(id: string, notes?: string): Promise<{ data: ProspectCandidate; message: string }> {
    const response = await api.post(`/api/prospects/${id}/contact`, { notes });
    return response.data;
  },

  /**
   * Convert prospect to qualified candidate
   */
  async convertToCandidate(id: string, candidateData: any): Promise<{ data: any; message: string }> {
    const response = await api.post(`/api/prospects/${id}/convert`, candidateData);
    return response.data;
  },

  /**
   * Get cities suggestions for autocomplete
   */
  async getCitiesSuggestions(query?: string): Promise<{ success: boolean; data: string[] }> {
    const response = await api.get('/api/prospects/suggestions/cities', {
      params: query ? { q: query } : undefined,
    });
    return response.data;
  },

  /**
   * Get prospect names suggestions for autocomplete
   */
  async getProspectsSuggestions(query: string): Promise<{
    success: boolean;
    data: Array<{ id: string; label: string; email: string }>
  }> {
    const response = await api.get('/api/prospects/suggestions/names', {
      params: { q: query },
    });
    return response.data;
  },

  /**
   * Get prospects statistics
   */
  async getProspectsStats(): Promise<{
    success: boolean;
    data: {
      total: number;
      contacted: number;
      pending: number;
      converted: number;
      conversionRate: string;
    }
  }> {
    const response = await api.get('/api/prospects/stats/summary');
    return response.data;
  },

  /**
   * Get prospects by city for map
   */
  async getProspectsByCity(): Promise<{
    success: boolean;
    data: Array<{ city: string; count: number }>
  }> {
    const response = await api.get('/api/prospects/stats/by-city');
    return response.data;
  },
};
