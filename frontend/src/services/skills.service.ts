import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

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

export const skillsService = {
  /**
   * Extract skills from a candidate's CV using AI
   */
  extractSkills: async (
    candidateId: string,
    model: 'gpt-3.5-turbo' | 'gpt-4' = 'gpt-3.5-turbo',
    accessToken: string
  ): Promise<ExtractionResult> => {
    const response = await axios.post(
      `${API_URL}/api/skills/extract/${candidateId}`,
      { model },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return response.data;
  },

  /**
   * Save extracted skills to a candidate
   */
  saveSkills: async (
    candidateId: string,
    skills: Array<{
      name: string;
      level: string;
      yearsExperience?: number;
    }>,
    accessToken: string
  ) => {
    const response = await axios.post(
      `${API_URL}/api/skills/${candidateId}/save`,
      { skills },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return response.data;
  },

  /**
   * Get skills for a candidate
   */
  getCandidateSkills: async (candidateId: string, accessToken: string) => {
    const response = await axios.get(
      `${API_URL}/api/skills/${candidateId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return response.data;
  },

  /**
   * Batch extract skills from multiple candidates
   */
  batchExtractSkills: async (
    candidateIds: string[],
    model: 'gpt-3.5-turbo' | 'gpt-4' = 'gpt-3.5-turbo',
    accessToken: string
  ) => {
    const response = await axios.post(
      `${API_URL}/api/skills/extract/batch`,
      { candidateIds, model },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return response.data;
  },
};
