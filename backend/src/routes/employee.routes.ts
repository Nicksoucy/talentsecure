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
  getEmployeeHistoryHandler,
  promoteCandidateToEmployee,
  promoteProspectToEmployee,
} from '../controllers/employee.controller';
import {
  getEmployeeClosure,
  previewEmployeeClosure,
  sendEmployeeClosure,
  resendEmployeeClosure,
  closeEmployeeSilently,
  getEmployeeClosureLetter,
  sendEmployeeClosureSms,
} from '../controllers/employee-closure.controller';
import { authenticateJWT, authorizeReadWrite } from '../middleware/auth';
import { validate } from '../middleware/validation.middleware';
import {
  createEmployeeSchema,
  employeeClosureSchema,
  employeeClosureResendSchema,
  employeeSilentClosureSchema,
  updateEmployeeSchema,
} from '../validation/employee.validation';

const uuidParam = z.object({ id: z.string().uuid('ID invalide') });
const candidateIdParam = z.object({ candidateId: z.string().uuid('ID invalide') });
const noticeParams = z.object({
  id: z.string().uuid('ID invalide'),
  noticeId: z.string().uuid('ID invalide'),
});
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
router.get('/:id/history', validate({ params: uuidParam }), getEmployeeHistoryHandler);
router.put('/:id', validate({ params: uuidParam, body: updateEmployeeSchema }), updateEmployee);
router.delete('/:id', validate({ params: uuidParam }), deleteEmployee);

// Fermeture de dossier : lettre par courriel (CC paie + RH), texto, date limite
// de retour des uniformes. Écriture réservée ADMIN/RH (authorizeReadWrite).
router.get('/:id/closure', validate({ params: uuidParam }), getEmployeeClosure);
router.post(
  '/:id/closure/preview',
  validate({ params: uuidParam, body: employeeClosureSchema }),
  previewEmployeeClosure
);
router.post('/:id/closure/silent', validate({ params: uuidParam, body: employeeSilentClosureSchema }), closeEmployeeSilently);
router.post('/:id/closure', validate({ params: uuidParam, body: employeeClosureSchema }), sendEmployeeClosure);
router.post(
  '/:id/closure/:noticeId/resend',
  validate({ params: noticeParams, body: employeeClosureResendSchema }),
  resendEmployeeClosure
);
router.get('/:id/closure/:noticeId/letter', validate({ params: noticeParams }), getEmployeeClosureLetter);
router.post(
  '/:id/closure/:noticeId/sms',
  validate({ params: noticeParams, body: employeeClosureResendSchema }),
  sendEmployeeClosureSms
);

export default router;
