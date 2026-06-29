import api from './api';

export interface ExtractedSkill {
  skillName: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  confidence: number;
  yearsExperience?: number;
  reasoning?: string;
  isSecurityRelated?: boolean;
}

export interface ExtractionResult {
  success: boolean;
  candidateId: string;
  model: string;
  skillsFound: ExtractedSkill[];
  totalSkills: number;
  processingTimeMs: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  errorMessage?: string;
}

// P2-C : passe par l'instance `api` partagée (injection du token + refresh
// single-in-flight via les intercepteurs) au lieu d'axios nu + headers manuels.
// Les méthodes ne prennent donc plus de paramètre `accessToken`.
export const skillsService = {
  /** Extract skills from a candidate's CV using AI */
  extractSkills: async (
    candidateId: string,
    model: 'gpt-3.5-turbo' | 'gpt-4' = 'gpt-3.5-turbo',
    mode: 'merge' | 'replace' = 'merge'
  ): Promise<ExtractionResult> => {
    const response = await api.post(`/api/skills/extract/${candidateId}`, { model, mode });
    return response.data;
  },

  /** Save extracted skills to a candidate */
  saveSkills: async (
    candidateId: string,
    skills: Array<{ name: string; level: string; yearsExperience?: number }>
  ) => {
    const response = await api.post(`/api/skills/${candidateId}/save`, { skills });
    return response.data;
  },

  /** Get skills for a candidate */
  getCandidateSkills: async (candidateId: string) => {
    const response = await api.get(`/api/skills/${candidateId}`);
    return response.data;
  },

  /** Batch extract skills from multiple candidates */
  batchExtractSkills: async (
    candidateIds: string[],
    model: 'gpt-3.5-turbo' | 'gpt-4' = 'gpt-3.5-turbo'
  ) => {
    const response = await api.post(`/api/skills/extract/batch`, { candidateIds, model });
    return response.data;
  },

  /** Search extracted skills across all candidates */
  searchSkills: async (
    query: string,
    category?: string,
    minConfidence?: number,
    excludeSecurity?: boolean
  ) => {
    const params = new URLSearchParams();
    if (query) params.append('q', query);
    if (category) params.append('category', category);
    if (minConfidence) params.append('minConfidence', minConfidence.toString());
    if (excludeSecurity) params.append('excludeSecurity', 'true');

    const response = await api.get(`/api/skills/search?${params.toString()}`);
    return response.data;
  },

  exportSkills: async (
    format: 'csv' | 'excel' | 'pdf',
    params: { query?: string; category?: string; minConfidence?: number; limit?: number } = {}
  ) => {
    const queryParams: Record<string, string> = {};
    if (params.query) queryParams.q = params.query;
    if (params.category) queryParams.category = params.category;
    if (typeof params.minConfidence === 'number') {
      queryParams.minConfidence = params.minConfidence.toString();
    }
    if (typeof params.limit === 'number') {
      queryParams.limit = params.limit.toString();
    }

    const response = await api.get(`/api/exports/skills/${format}`, {
      params: queryParams,
      responseType: 'blob',
    });

    return response;
  },

  /** Get prospect skills distribution stats */
  getProspectSkillsDistribution: async () => {
    const response = await api.get(`/api/skills/prospect-stats`);
    return response.data;
  },
};
