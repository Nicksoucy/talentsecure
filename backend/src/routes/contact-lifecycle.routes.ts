import { Router } from 'express';
import { lookupContact, moveContactController } from '../controllers/contact-lifecycle.controller';
import { authenticateStaff } from '../middleware/auth';

const router = Router();

router.use(authenticateStaff);

// GET /api/contacts/lookup?email=&phone=
router.get('/lookup', lookupContact);

// POST /api/contacts/move { fromSection, fromId, toSection }
router.post('/move', moveContactController);

export default router;
