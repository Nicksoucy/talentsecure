import api from './api';
import { Candidate } from '@/types';

interface GetCandidatesParams {
  search?: string;
  status?: string;
  minRating?: number;
  city?: string;
  hasBSP?: boolean;
  hasVehicle?: boolean;
  hasVideo?: boolean;
  hasDriverLicense?: boolean;
  hasCV?: boolean;
  canWorkUrgent?: boolean;
  maxTravelKm?: number;
  bspStatus?: string;
  interviewDateStart?: string;
  interviewDateEnd?: string;
  includeArchived?: boolean;
  certification?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CandidatesResponse {
  data: Candidate[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const candidateService = {
  /**
   * Get all candidates with filters
   */
  async getCandidates(params?: GetCandidatesParams): Promise<CandidatesResponse> {
    const response = await api.get('/api/candidates', { params });
    return response.data;
  },

  /**
   * Get single candidate by ID
   */
  async getCandidateById(id: string): Promise<{ data: Candidate }> {
    const response = await api.get(`/api/candidates/${id}`);
    return response.data;
  },

  /**
   * Create new candidate
   */
  async createCandidate(data: any): Promise<{ data: Candidate; message: string }> {
    const response = await api.post('/api/candidates', data);
    return response.data;
  },

  /**
   * Update candidate
   */
  async updateCandidate(id: string, data: any): Promise<{ data: Candidate; message: string }> {
    const response = await api.put(`/api/candidates/${id}`, data);
    return response.data;
  },

  /**
   * Delete candidate
   */
  async deleteCandidate(id: string): Promise<{ message: string }> {
    const response = await api.delete(`/api/candidates/${id}`);
    return response.data;
  },

  /**
   * Archive candidate
   */
  async archiveCandidate(id: string): Promise<{ message: string; data: Candidate }> {
    const response = await api.patch(`/api/candidates/${id}/archive`);
    return response.data;
  },

  /**
   * Unarchive (restore) candidate
   */
  async unarchiveCandidate(id: string): Promise<{ message: string; data: Candidate }> {
    const response = await api.patch(`/api/candidates/${id}/unarchive`);
    return response.data;
  },

  /**
   * Get cities suggestions for autocomplete
   */
  async getCitiesSuggestions(query?: string): Promise<{ success: boolean; data: string[] }> {
    const response = await api.get('/api/candidates/suggestions/cities', {
      params: query ? { q: query } : undefined,
    });
    return response.data;
  },

  /**
   * Get candidate names suggestions for autocomplete
   */
  async getCandidatesSuggestions(query: string): Promise<{
    success: boolean;
    data: Array<{ id: string; label: string; email: string }>
  }> {
    const response = await api.get('/api/candidates/suggestions/names', {
      params: { q: query },
    });
    return response.data;
  },

  /**
   * Upload video for candidate (Multipart - Legacy/Fallback)
   */
  async uploadVideo(candidateId: string, videoFile: File): Promise<{
    success: boolean;
    message: string;
    data: {
      id: string;
      videoStoragePath: string;
      videoUploadedAt: string;
    }
  }> {
    const formData = new FormData();
    formData.append('video', videoFile);

    const response = await api.post(`/api/candidates/${candidateId}/video`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Initiate Direct Video Upload (Get Signed URL)
   */
  async initiateVideoUpload(candidateId: string, filename: string, contentType: string): Promise<{
    success: boolean;
    data: {
      signedUrl: string;
      key: string;
      provider: string;
      expiresIn: number;
    }
  }> {
    const response = await api.post(`/api/candidates/${candidateId}/video/initiate-upload`, {
      filename,
      contentType
    });
    return response.data;
  },

  /**
   * Upload file directly to signed URL (PUT)
   */
  async uploadFileToUrl(
    url: string,
    file: File,
    contentType: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    // Development Proxy workaround for CORS issues on localhost
    // We rewrite the URL to go through Vite proxy (/r2-proxy) which forwards to R2
    // Requires forcePathStyle: true in backend to keep bucket name in path!
    if (window.location.hostname === 'localhost' && url.includes('r2.cloudflarestorage.com')) {
      url = url.replace(/https:\/\/.*\.r2\.cloudflarestorage\.com/, '/r2-proxy');
      console.log('Using R2 Development Proxy:', url);
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', contentType);

      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            onProgress(percentComplete);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          // If proxy fails, we might see 500 or 503
          reject(new Error(`Upload failed with status ${xhr.status} (Proxy/Network)`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(file);
    });
  },

  /**
   * Complete Direct Video Upload (Notify Backend)
   */
  async completeVideoUpload(candidateId: string, key: string): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> {
    const response = await api.post(`/api/candidates/${candidateId}/video/complete-upload`, {
      key
    });
    return response.data;
  },

  /**
   * Get video URL for candidate
   */
  async getVideoUrl(candidateId: string): Promise<{
    success: boolean;
    data: {
      videoUrl: string;
      videoUploadedAt: string;
      candidateName: string;
    }
  }> {
    const response = await api.get(`/api/candidates/${candidateId}/video`);
    return response.data;
  },

  /**
   * Delete video for candidate
   */
  async deleteVideo(candidateId: string): Promise<{ success: boolean; message: string }> {
    const response = await api.delete(`/api/candidates/${candidateId}/video`);
    return response.data;
  },

  /**
   * Get candidates statistics (total, by status)
   */
  async getCandidatesStats(): Promise<{
    success: boolean;
    data: {
      total: number;
      byStatus: Record<string, number>;
      elite: number;
      excellent: number;
      veryGood: number;
      good: number;
      qualified: number;
      toReview: number;
      pending: number;
      absent: number;
      inactive: number;
    }
  }> {
    const response = await api.get('/api/candidates/stats/summary');
    return response.data;
  },

  /**
   * Export candidates as CSV
   * Supports same filters as getCandidates
   */
  async exportCandidatesCSV(params?: GetCandidatesParams): Promise<Blob> {
    const response = await api.get('/api/candidates/export/csv', {
      params,
      responseType: 'blob', // Important for file downloads
    });
    return response.data;
  },

  /**
   * Extract skills using AI
   */
  async extractSkills(id: string, model: string = 'gpt-3.5-turbo'): Promise<any> {
    const response = await api.post(`/api/extraction/candidates/${id}/extract`, { model });
    return response.data;
  },

  /**
   * Advanced search with multiple filters
   */
  async advancedSearch(data: AdvancedSearchParams): Promise<CandidatesResponse> {
    const response = await api.post('/api/candidates/advanced-search', data);
    return response.data;
  },

  /**
   * Parse natural language search query
   */
  async parseNaturalLanguageQuery(query: string): Promise<{ success: boolean; data: AdvancedSearchParams }> {
    const response = await api.post('/api/candidates/ai-search', { query });
    return response.data;
  },

  /**
   * Get similar candidates
   */
  async getSimilarCandidates(id: string, limit: number = 3): Promise<{ success: boolean; data: Candidate[] }> {
    const response = await api.get(`/api/candidates/${id}/similar`, { params: { limit } });
    return response.data;
  },
};

export interface AdvancedSearchParams {
  cities?: string[];
  certifications?: string[];
  availability?: string[];
  minExperience?: number;
  minRating?: number;
  hasVehicle?: boolean;
  languages?: string[];
  skills?: string[];
  page?: number;
  limit?: number;
}
