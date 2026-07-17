import { Router } from 'express';
import { getMandatesMapPoints } from '../controllers/mandate.controller';
import { authenticateJWT, authorizeReadWrite } from '../middleware/auth';

const router = Router();

// Mêmes rôles que les autres cartes (mêmes personnes qui voient déjà candidats/
// employés). Lecture : ADMIN, RH, SALES, MAGASIN, MAGASIN_GESTION.
router.use(authenticateJWT);
router.use(
  authorizeReadWrite(
    ['ADMIN', 'RH_RECRUITER', 'SALES', 'MAGASIN', 'MAGASIN_GESTION'],
    ['ADMIN', 'RH_RECRUITER']
  )
);

// Points carte des mandats (couche rose).
router.get('/stats/map-points', getMandatesMapPoints);

export default router;
