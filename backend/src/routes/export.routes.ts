import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { exportSkillsCsv, exportSkillsExcel, exportSkillsPdf } from '../controllers/export.controller';

const router = Router();

router.get('/skills/csv', authenticateJWT, exportSkillsCsv);
router.get('/skills/excel', authenticateJWT, exportSkillsExcel);
router.get('/skills/pdf', authenticateJWT, exportSkillsPdf);

export default router;
