import { Router } from 'express';
import { z } from 'zod';
import {
  getEmployees,
  getEmployeeById,
  getEmployeesStats,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  promoteCandidateToEmployee,
} from '../controllers/employee.controller';
import { authenticateJWT } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';

const uuidParam = z.object({ id: z.string().uuid('ID invalide') });
const candidateIdParam = z.object({ candidateId: z.string().uuid('ID invalide') });

const router = Router();

// Toutes les routes employés requièrent l'authentification
router.use(authenticateJWT);

router.get('/', getEmployees);
router.get('/stats/summary', getEmployeesStats);
router.post('/', createEmployee);

// Promouvoir un candidat en employé
router.post('/promote/:candidateId', validate({ params: candidateIdParam }), promoteCandidateToEmployee);

router.get('/:id', validate({ params: uuidParam }), getEmployeeById);
router.put('/:id', validate({ params: uuidParam }), updateEmployee);
router.delete('/:id', validate({ params: uuidParam }), deleteEmployee);

export default router;
