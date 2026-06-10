import { Router } from 'express';
import { authenticateStaff } from '../middleware/auth';
import { exportSkillsCsv, exportSkillsExcel, exportSkillsPdf } from '../controllers/export.controller';

const router = Router();

router.get('/skills/csv', authenticateStaff, exportSkillsCsv);
router.get('/skills/excel', authenticateStaff, exportSkillsExcel);
router.get('/skills/pdf', authenticateStaff, exportSkillsPdf);

export default router;
