import { Request, Response, NextFunction } from 'express';
import * as questionnaireService from '../services/questionnaire.service';
import { successResponse } from '../utils/response';

/**
 * Page publique du questionnaire — aucune authentification.
 *
 * Le candidat n'a pas de compte : son seul justificatif est le jeton du lien.
 * Toutes les erreurs de lien (inconnu, expiré, déjà soumis, mauvaise version)
 * remontent avec le même message depuis le service, pour ne pas révéler
 * lesquels de ces jetons existent.
 */

export const getSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.query as { token: string };
    return successResponse(res, await questionnaireService.getPublicSession(token));
  } catch (error) {
    next(error);
  }
};

/** Sauvegarde automatique. Appelée souvent : doit rester silencieuse et rapide. */
export const saveAnswers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, answers } = req.body;
    return successResponse(res, await questionnaireService.saveAnswers(token, answers));
  } catch (error) {
    next(error);
  }
};

export const submit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, consent } = req.body;
    return successResponse(res, await questionnaireService.submitQuestionnaire(token, consent), {
      message: 'Merci, vos réponses sont enregistrées.',
    });
  } catch (error) {
    next(error);
  }
};
