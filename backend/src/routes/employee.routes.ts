import { Router } from 'express';
import { z } from 'zod';
import {
  getEmployees,
  getEmployeeById,
  getEmployeesStats,
  getEmployeesMapPoints,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  promoteCandidateToEmployee,
  promoteProspectToEmployee,
} from '../controllers/employee.controller';
import { authenticateJWT, authorizeReadWrite } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';
import { createEmployeeSchema, updateEmployeeSchema } from '../validation/employee.validation';

const uuidParam = z.object({ id: z.string().uuid('ID invalide') });
const candidateIdParam = z.object({ candidateId: z.string().uuid('ID invalide') });
const prospectIdParam = z.object({ prospectId: z.string().uuid('ID invalide') });

const router = Router();

// Toutes les routes employés requièrent l'authentification.
// Lecture (GET) : ADMIN, RH, SALES, MAGASIN. Écriture (POST/PUT/DELETE, dont
// les promotions) : ADMIN, RH seulement (verrouille l'ancienne ouverture totale).
router.use(authenticateJWT);
router.use(authorizeReadWrite(['ADMIN', 'RH_RECRUITER', 'SALES', 'MAGASIN', 'MAGASIN_GESTION'], ['ADMIN', 'RH_RECRUITER']));

router.get('/', getEmployees);
router.get('/stats/summary', getEmployeesStats);
// Points carte des agents actifs (déclaré avant /:id — sa validation uuid 400erait).
router.get('/stats/map-points', getEmployeesMapPoints);
router.post('/', validate({ body: createEmployeeSchema }), createEmployee);

// Promouvoir un candidat en employé
router.post('/promote/:candidateId', validate({ params: candidateIdParam }), promoteCandidateToEmployee);

// Promouvoir un candidat potentiel (prospect) directement en employé
router.post('/promote-prospect/:prospectId', validate({ params: prospectIdParam }), promoteProspectToEmployee);

router.get('/:id', validate({ params: uuidParam }), getEmployeeById);
router.put('/:id', validate({ params: uuidParam, body: updateEmployeeSchema }), updateEmployee);
router.delete('/:id', validate({ params: uuidParam }), deleteEmployee);

export default router;
