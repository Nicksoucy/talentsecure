import { Router } from 'express';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import * as ctrl from '../controllers/notification.controller';

const router = Router();

// Internal trigger (no auth, token-gated) — utile pour Cloud Scheduler fallback.
router.post('/internal/dispatch', ctrl.runDispatch);

// User-facing endpoints
router.use(authenticateJWT);
router.use(authorizeRoles('ADMIN', 'RH_RECRUITER'));

router.get('/', ctrl.list);
router.post('/mark-all-read', ctrl.readAll);
router.post('/:id/read', ctrl.readOne);

export default router;
