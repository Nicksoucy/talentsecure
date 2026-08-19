import api from './api';
import type { QuestionnaireInvitation, QuestionnaireSummary } from '@/types/questionnaire';

export const questionnaireService = {
  /**
   * Génère (ou reprend) le lien d'une personne. Aucun envoi automatique : le
   * lien revient à l'écran et c'est le personnel RH qui décide de l'envoyer.
   */
  async createInvitation(
    personType: 'candidate' | 'prospect',
    personId: string
  ): Promise<{ data: QuestionnaireInvitation }> {
    const r = await api.post('/api/questionnaires/invitations', { personType, personId });
    return r.data;
  },

  /** Conclusions de la dernière passation. `data` vaut null si aucune. */
  async getPersonSummary(
    personType: 'candidate' | 'prospect',
    personId: string
  ): Promise<{ data: QuestionnaireSummary | null }> {
    const r = await api.get(`/api/questionnaires/person/${personType}/${personId}`);
    return r.data;
  },
};
