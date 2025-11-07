import api from './api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const uploadService = {
  /**
   * Upload CV for a candidate
   */
  uploadCV: async (candidateId: string, file: File) => {
    const formData = new FormData();
    formData.append('cv', file);

    const response = await api.post(
      `/api/candidates/${candidateId}/cv`,
      formData
    );

    return response.data;
  },

  /**
   * Get CV download URL for a candidate
   */
  getCVDownloadUrl: (candidateId: string) => {
    const token = localStorage.getItem('token');
    return `${API_URL}/api/candidates/${candidateId}/cv/download?token=${token}`;
  },

  /**
   * Delete CV for a candidate
   */
  deleteCV: async (candidateId: string) => {
    const response = await api.delete(
      `/api/candidates/${candidateId}/cv`
    );

    return response.data;
  },
};
