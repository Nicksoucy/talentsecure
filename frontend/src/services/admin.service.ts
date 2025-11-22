import api from './api';
import { Candidate } from '@/types';

export const adminService = {
  /**
   * Revert a candidate back to prospect
   * Preserves all data including CV
   */
  async revertCandidateToProspect(candidateId: string): Promise<{
    success: boolean;
    message: string;
    prospectId: string;
  }> {
    const response = await api.post(`/api/admin/revert-candidate-to-prospect/${candidateId}`);
    return response.data;
  },

  /**
   * Get all auto-converted candidates
   */
  async getAutoConvertedCandidates(): Promise<{
    success: boolean;
    count: number;
    candidates: Array<{
      id: string;
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string;
      city: string;
      hrNotes: string | null;
      createdAt: string;
    }>;
  }> {
    const response = await api.get('/api/admin/auto-converted-candidates');
    return response.data;
  },

  /**
   * Revert ALL auto-converted candidates to prospects
   */
  async revertAllAutoConvertedCandidates(): Promise<{
    success: boolean;
    message: string;
    results: Array<{
      name: string;
      action: 'prospect_restored' | 'prospect_created' | 'error';
      prospectId?: string;
      candidateId?: string;
      error?: string;
    }>;
  }> {
    const response = await api.post('/api/admin/revert-auto-converted-candidates');
    return response.data;
  },

  /**
   * Revert MULTIPLE candidates to prospects (Batch)
   */
  async revertBatchCandidatesToProspects(candidateIds: string[]): Promise<{
    success: boolean;
    message: string;
    results: Array<{
      id: string;
      status: 'success' | 'error';
      prospectId?: string;
      name?: string;
      message?: string;
    }>;
  }> {
    const response = await api.post('/api/admin/revert-batch-candidates-to-prospects', { ids: candidateIds });
    return response.data;
  },
};
