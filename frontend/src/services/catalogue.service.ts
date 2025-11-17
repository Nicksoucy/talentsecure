import api from './api';

export interface Catalogue {
  id: string;
  clientId: string;
  title: string;
  customMessage?: string;
  status: 'BROUILLON' | 'GENERE' | 'ENVOYE' | 'ACCEPTE' | 'REFUSE';
  includeSummary: boolean;
  includeDetails: boolean;
  includeVideo: boolean;
  includeExperience: boolean;
  includeSituation: boolean;
  includeCV: boolean;
  pdfUrl?: string;
  pdfStoragePath?: string;
  generatedAt?: string;
  sentAt?: string;
  viewedAt?: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  client?: any;
  createdBy?: any;
  items?: CatalogueItem[];
}

export interface CatalogueItem {
  id: string;
  catalogueId: string;
  candidateId: string;
  order: number;
  candidate?: any;
}

export interface CreateCatalogueData {
  clientId: string;
  title: string;
  customMessage?: string;
  candidateIds?: string[];
  includeSummary?: boolean;
  includeDetails?: boolean;
  includeVideo?: boolean;
  includeExperience?: boolean;
  includeSituation?: boolean;
  includeCV?: boolean;
}

export interface UpdateCatalogueData {
  title?: string;
  customMessage?: string;
  status?: string;
  candidateIds?: string[];
  includeSummary?: boolean;
  includeDetails?: boolean;
  includeVideo?: boolean;
  includeExperience?: boolean;
  includeSituation?: boolean;
  includeCV?: boolean;
}

export interface GetCataloguesParams {
  page?: number;
  limit?: number;
  status?: string;
  clientId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const catalogueService = {
  /**
   * Get all catalogues with filters
   */
  getCatalogues: async (params?: GetCataloguesParams) => {
    const response = await api.get('/api/catalogues', { params });
    return response.data;
  },

  /**
   * Get single catalogue by ID
   */
  getCatalogueById: async (id: string) => {
    const response = await api.get(`/api/catalogues/${id}`);
    return response.data;
  },

  /**
   * Create new catalogue
   */
  createCatalogue: async (data: CreateCatalogueData) => {
    const response = await api.post('/api/catalogues', data);
    return response.data;
  },

  /**
   * Update catalogue
   */
  updateCatalogue: async (id: string, data: UpdateCatalogueData) => {
    const response = await api.put(`/api/catalogues/${id}`, data);
    return response.data;
  },

  /**
   * Delete catalogue
   */
  deleteCatalogue: async (id: string) => {
    const response = await api.delete(`/api/catalogues/${id}`);
    return response.data;
  },

  /**
   * Generate catalogue PDF
   */
  generateCataloguePDF: async (id: string) => {
    try {
      const response = await api.post(`/api/catalogues/${id}/generate`, {}, {
        responseType: 'blob',
      });

      // Create a download link for the PDF
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Extract filename from Content-Disposition header or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'catalogue.pdf';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      return { message: 'PDF téléchargé avec succès' };
    } catch (error: any) {
      // Handle blob error responses
      if (error.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          if (text && text !== 'null') {
            const errorData = JSON.parse(text);
            throw { ...error, response: { ...error.response, data: errorData } };
          }
        } catch (parseError) {
          console.error('Failed to parse blob error:', parseError);
        }
      }
      throw error;
    }
  },
};
