import { Router } from 'express';
import {
  createInvitation,
  getPersonSummary,
  getResponseDetail,
} from '../controllers/questionnaire.controller';
import { authenticateJWT, authorizeReadWrite, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';
import {
  createInvitationSchema,
  personParamsSchema,
  responseIdParamSchema,
} from '../validation/questionnaire.validation';

const router = Router();

router.use(authenticateJWT);

// Lecture des conclusions : le personnel qui prend les décisions d'affectation.
// Écriture (générer un lien d'invitation) : ADMIN et RH.
router.use(authorizeReadWrite(['ADMIN', 'RH_RECRUITER', 'SALES'], ['ADMIN', 'RH_RECRUITER']));

router.post('/invitations', validate({ body: createInvitationSchema }), createInvitation);

router.get(
  '/person/:personType/:personId',
  validate({ params: personParamsSchema }),
  getPersonSummary
);

/**
 * Détail énoncé par énoncé — ADMIN SEULEMENT.
 *
 * La CDPDJ (1998, recommandation 6) demande que les réponses individuelles ne
 * soient connues que de la personne qui administre le test ; les décideurs ne
 * doivent voir que les conclusions. La garde de rôle vit ici, pas dans le
 * service, pour rester visible à la lecture des routes.
 */
router.get(
  '/responses/:id',
  authorizeRoles('ADMIN'),
  validate({ params: responseIdParamSchema }),
  getResponseDetail
);

export default router;
