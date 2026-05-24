import api from './api';

export type ContactSection = 'employee' | 'candidate' | 'prospect';

export interface ContactConflict {
  section: ContactSection;
  id: string;
  firstName: string;
  lastName: string;
}

export const contactService = {
  /**
   * Déplace un contact d'une section à une autre.
   */
  async move(params: { fromSection: ContactSection; fromId: string; toSection: ContactSection }): Promise<{
    message: string;
    data: { section: ContactSection; id: string; firstName: string; lastName: string };
  }> {
    const response = await api.post('/api/contacts/move', params);
    return response.data;
  },

  /**
   * Recherche un contact dans les 3 sections (email OU téléphone).
   */
  async lookup(email?: string, phone?: string): Promise<{ data: ContactConflict | null }> {
    const response = await api.get('/api/contacts/lookup', { params: { email, phone } });
    return response.data;
  },
};
