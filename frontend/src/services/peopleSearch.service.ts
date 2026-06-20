import api from './api';

export type PeopleSection = 'employee' | 'candidate' | 'prospect';

export interface PeopleSearchCounts {
  employees: number;
  candidates: number;
  prospects: number;
}

export interface PeopleSearchHit {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  section: PeopleSection;
}

export interface PeopleSearchGroups {
  employees: PeopleSearchHit[];
  candidates: PeopleSearchHit[];
  prospects: PeopleSearchHit[];
}

/**
 * Recherche transversale (employés + candidats + prospects) — moteur tokenisé,
 * accent-insensible, téléphone normalisé, repli flou côté backend. Respecte les
 * rôles (MAGASIN → employés seulement).
 */
export const peopleSearchService = {
  /** Compte les correspondances par table (bandeau « trouvé ailleurs »). */
  async getCrossTableCounts(q: string): Promise<PeopleSearchCounts> {
    const res = await api.get('/api/contacts/search-count', { params: { q } });
    return res.data.data;
  },

  /** Top-N fiches par table, groupées (omnibox global Cmd+K). */
  async searchAll(q: string, limit = 6): Promise<PeopleSearchGroups> {
    const res = await api.get('/api/contacts/search', { params: { q, limit } });
    return res.data.data;
  },
};
