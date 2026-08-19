import api from './api';
import type {
  Mandate,
  MandateProfileInput,
  MandateCandidate,
  MandateCandidatesMeta,
  SiteType,
} from '@/types/mandate';

export interface MandateFilters {
  search?: string;
  city?: string;
  siteType?: SiteType;
  isActive?: boolean;
  /** Ne garder que les mandats dont le profil n'a jamais été rempli. */
  unratedOnly?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'city' | 'profileUpdatedAt' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface MandatesResponse {
  data: Mandate[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface MandateCandidatesResponse {
  data: { mandate: Mandate; candidates: MandateCandidate[] };
  meta: MandateCandidatesMeta;
}

export const mandateService = {
  async getMandates(filters: MandateFilters = {}): Promise<MandatesResponse> {
    // Le schéma backend est `.strict()` : envoyer une clé à `undefined` la ferait
    // sérialiser comme absente par axios, mais une chaîne vide passerait — d'où
    // le nettoyage explicite.
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== undefined && v !== '')
    );
    const response = await api.get('/api/mandates', { params });
    return response.data;
  },

  async getMandate(id: string): Promise<{ data: Mandate }> {
    const response = await api.get(`/api/mandates/${id}`);
    return response.data;
  },

  async updateProfile(id: string, input: MandateProfileInput): Promise<{ data: Mandate }> {
    const response = await api.patch(`/api/mandates/${id}`, input);
    return response.data;
  },

  async getCandidates(
    id: string,
    opts: { limit?: number; includeIneligible?: boolean } = {}
  ): Promise<MandateCandidatesResponse> {
    const response = await api.get(`/api/mandates/${id}/candidates`, { params: opts });
    return response.data;
  },
};
