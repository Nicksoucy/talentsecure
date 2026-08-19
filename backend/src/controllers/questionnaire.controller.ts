import { Request, Response, NextFunction } from 'express';
import * as questionnaireService from '../services/questionnaire.service';
import type { PersonType } from '../services/questionnaire.service';
import { successResponse } from '../utils/response';

/** Base publique des liens envoyés aux candidats. */
const FRONTEND_URL = () => process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Génère (ou reprend) le lien du questionnaire pour une personne.
 *
 * Le lien est renvoyé au personnel RH, qui l'envoie lui-même : pas d'envoi
 * automatique ici, pour ne pas transformer un clic d'exploration en courriel
 * parti chez un candidat.
 */
export const createInvitation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { personType, personId } = req.body as { personType: PersonType; personId: string };
    const invitation = await questionnaireService.createInvitation(
      personType,
      personId,
      req.user?.id ?? null
    );

    return successResponse(res, {
      id: invitation.id,
      url: `${FRONTEND_URL()}/mon-profil/${invitation.accessToken}`,
      expiresAt: invitation.expiresAt,
      status: invitation.status,
    });
  } catch (error) {
    next(error);
  }
};

/** Dernière réponse complétée d'une personne (scores, pas le détail). */
export const getPersonSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { personType, personId } = req.params as { personType: PersonType; personId: string };
    const summary = await questionnaireService.getLatestCompletedFor(personType, personId);
    return successResponse(res, summary);
  } catch (error) {
    next(error);
  }
};

/**
 * Détail énoncé par énoncé. Réservé ADMIN par la route : la CDPDJ recommande
 * que les réponses individuelles restent chez la personne qui administre le
 * test, les décideurs n'ayant que les conclusions.
 */
export const getResponseDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    return successResponse(res, await questionnaireService.getResponseWithAnswers(req.params.id));
  } catch (error) {
    next(error);
  }
};
