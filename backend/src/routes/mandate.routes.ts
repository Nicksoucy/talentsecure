import { Router } from 'express';
import {
  getMandatesMapPoints,
  listMandates,
  getMandate,
  updateMandateProfile,
  getMandateCandidates,
} from '../controllers/mandate.controller';
import { authenticateJWT, authorizeReadWrite } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';
import {
  mandateFiltersSchema,
  mandateIdParamSchema,
  mandateCandidatesQuerySchema,
  updateMandateProfileSchema,
} from '../validation/mandate.validation';

const router = Router();

// Mêmes rôles que les autres cartes (mêmes personnes qui voient déjà candidats/
// employés). Lecture : ADMIN, RH, SALES, MAGASIN, MAGASIN_GESTION.
// Écriture (saisie du profil de mandat) : ADMIN, RH uniquement.
router.use(authenticateJWT);
router.use(
  authorizeReadWrite(
    ['ADMIN', 'RH_RECRUITER', 'SALES', 'MAGASIN', 'MAGASIN_GESTION'],
    ['ADMIN', 'RH_RECRUITER']
  )
);

// Points carte des mandats (couche rose). Déclaré avant `/:id` : deux segments,
// donc aucune ambiguïté possible, mais l'ordre garde l'intention lisible.
router.get('/stats/map-points', getMandatesMapPoints);

router.get('/', validate({ query: mandateFiltersSchema }), listMandates);

router.get('/:id', validate({ params: mandateIdParamSchema }), getMandate);

router.patch(
  '/:id',
  validate({ params: mandateIdParamSchema, body: updateMandateProfileSchema }),
  updateMandateProfile
);

// Candidats classés pour ce mandat (critères durs + distance, sans psychométrie).
router.get(
  '/:id/candidates',
  validate({ params: mandateIdParamSchema, query: mandateCandidatesQuerySchema }),
  getMandateCandidates
);

export default router;
