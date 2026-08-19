import axios from 'axios';
import type { AnswerInput, QuestionnaireSession } from '@/types/questionnaire';

// Instance NON authentifiée : le candidat arrive par un lien reçu par courriel
// ou par SMS et n'a pas de compte. Ne jamais remplacer par le client `api`
// partagé — son intercepteur ajouterait un jeton d'employé.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const publicApi = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

export const publicQuestionnaireService = {
  async getSession(token: string): Promise<QuestionnaireSession> {
    const r = await publicApi.get('/api/public/questionnaire/session', { params: { token } });
    return r.data.data as QuestionnaireSession;
  },

  /** Sauvegarde automatique. Appelée à chaque page tournée. */
  async saveAnswers(token: string, answers: AnswerInput[]): Promise<void> {
    if (answers.length === 0) return;
    await publicApi.post('/api/public/questionnaire/answers', { token, answers });
  },

  /** Le serveur ne renvoie aucun score : ce n'est pas un test qu'on réussit. */
  async submit(token: string): Promise<void> {
    await publicApi.post('/api/public/questionnaire/submit', { token, consent: true });
  },
};
