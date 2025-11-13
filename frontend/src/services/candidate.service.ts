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
   * Upload video for candidate
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
};
