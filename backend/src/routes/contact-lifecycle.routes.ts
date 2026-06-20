import { Router } from 'express';
import {
  lookupContact,
  moveContactController,
  searchPeopleCount,
  searchPeople,
} from '../controllers/contact-lifecycle.controller';
import { authenticateStaff } from '../middleware/auth';

const router = Router();

router.use(authenticateStaff);

// GET /api/contacts/lookup?email=&phone=
router.get('/lookup', lookupContact);

// GET /api/contacts/search-count?q=  → { employees, candidates, prospects } (bandeau « trouvé ailleurs »)
router.get('/search-count', searchPeopleCount);

// GET /api/contacts/search?q=&limit=  → top-N par section (omnibox global Cmd+K)
router.get('/search', searchPeople);

// POST /api/contacts/move { fromSection, fromId, toSection }
router.post('/move', moveContactController);

export default router;
