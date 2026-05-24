import { Router } from 'express';
import { lookupContact, moveContactController } from '../controllers/contact-lifecycle.controller';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

router.use(authenticateJWT);

// GET /api/contacts/lookup?email=&phone=
router.get('/lookup', lookupContact);

// POST /api/contacts/move { fromSection, fromId, toSection }
router.post('/move', moveContactController);

export default router;
