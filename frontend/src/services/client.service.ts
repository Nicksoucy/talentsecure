import api from './api';

export interface Client {
  id: string;
  name: string;
  companyName?: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    catalogues: number;
    placements: number;
  };
}

interface GetClientsParams {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface ClientsResponse {
  data: Client[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const clientService = {
  /**
   * Get all clients with filters and pagination
   */
  getClients: async (params?: GetClientsParams): Promise<ClientsResponse> => {
    const response = await api.get('/api/clients', { params });
    return response.data;
  },

  /**
   * Get single client by ID
   */
  getClientById: async (id: string): Promise<{ data: Client }> => {
    const response = await api.get(`/api/clients/${id}`);
    return response.data;
  },

  /**
   * Create new client
   */
  createClient: async (data: Partial<Client>): Promise<{ data: Client; message: string }> => {
    const response = await api.post('/api/clients', data);
    return response.data;
  },

  /**
   * Update client
   */
  updateClient: async (id: string, data: Partial<Client>): Promise<{ data: Client; message: string }> => {
    const response = await api.put(`/api/clients/${id}`, data);
    return response.data;
  },

  /**
   * Delete (deactivate) client
   */
  deleteClient: async (id: string): Promise<{ message: string }> => {
    const response = await api.delete(`/api/clients/${id}`);
    return response.data;
  },

  /**
   * Reactivate client
   */
  reactivateClient: async (id: string): Promise<{ data: Client; message: string }> => {
    const response = await api.post(`/api/clients/${id}/reactivate`);
    return response.data;
  },
};
