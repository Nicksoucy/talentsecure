import { Router } from 'express';
import {
  getSession,
  saveAnswers,
  submit,
} from '../controllers/public-questionnaire.controller';
import { validate } from '../middleware/validation.middleware';
import { questionnaireLimiter } from '../middleware/rate-limit.middleware';
import {
  questionnaireSessionQuerySchema,
  saveAnswersSchema,
  submitQuestionnaireSchema,
} from '../validation/questionnaire.validation';

/**
 * Questionnaire public — le candidat n'a pas de compte.
 *
 * Ce fichier ne doit JAMAIS importer de middleware d'auth : si vous en ajoutez
 * un, plus personne ne peut remplir le questionnaire. Le jeton du lien est le
 * seul justificatif, et il est validé dans le service.
 */
const router = Router();

router.use(questionnaireLimiter);

router.get('/session', validate({ query: questionnaireSessionQuerySchema }), getSession);
router.post('/answers', validate({ body: saveAnswersSchema }), saveAnswers);
router.post('/submit', validate({ body: submitQuestionnaireSchema }), submit);

export default router;
