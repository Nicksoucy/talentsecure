import { Router } from 'express';
import { z } from 'zod';
import { getContractMapPoints, listContracts } from '../controllers/contract.controller';
import { authenticateJWT, authorizeReadWrite } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';

const router = Router();

// Mêmes rôles que les autres cartes. Attention : ces endpoints renvoient des
// NOMS DE PERSONNES — le rôle CLIENT ne doit jamais y accéder (403).
router.use(authenticateJWT);
router.use(
  authorizeReadWrite(
    ['ADMIN', 'RH_RECRUITER', 'SALES', 'MAGASIN', 'MAGASIN_GESTION'],
    ['ADMIN', 'RH_RECRUITER']
  )
);

// Code de contrat : borné avant de servir de clé de cache.
const contractCodeParams = z.object({
  code: z
    .string()
    .regex(/^[A-Za-z0-9_-]{2,20}$/, 'Code de contrat invalide (2 à 20 caractères alphanumériques)'),
});

// Contrats existants + décomptes (filtre des listes).
router.get('/', listContracts);

// Points carte d'un contrat (couche colorée togglable).
router.get('/:code/map-points', validate({ params: contractCodeParams }), getContractMapPoints);

export default router;
