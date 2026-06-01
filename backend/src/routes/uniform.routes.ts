import { Router } from 'express';
import multer from 'multer';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import { publicShareLimiter } from '../middleware/rate-limit.middleware';
import * as ctrl from '../controllers/uniform.controller';
import * as iss from '../controllers/uniform-issuance.controller';
import * as ret from '../controllers/uniform-return.controller';
import * as wash from '../controllers/uniform-wash-batch.controller';

const router = Router();

// Upload PDF (mémoire — on relaie direct vers R2).
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF sont acceptés'));
    }
  },
});

// Upload image (photo de morceau) — mémoire, relayé vers R2.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Seules les images sont acceptées'));
  },
});

// -------------------------------------------------------------------------
// Signature publique (sans auth) — DOIT précéder authenticateJWT.
// Gère prêt ET retour via le token.
// -------------------------------------------------------------------------
router.get('/sign/:token', publicShareLimiter, ctrl.getSignPayload);
router.post('/sign/:token', publicShareLimiter, ctrl.submitSign);

// -------------------------------------------------------------------------
// Tout le reste : staff ADMIN + RH_RECRUITER.
// -------------------------------------------------------------------------
router.use(authenticateJWT);
router.use(authorizeRoles('ADMIN', 'RH_RECRUITER'));

// Stats & rapports
router.get('/stats/summary', ctrl.statsSummary);
router.get('/reports/stock', ctrl.reportStock);
router.get('/reports/overdue', ctrl.reportOverdue);
router.get('/reports/losses', ctrl.reportLosses);

// Inventaire — mouvements
router.get('/movements', ctrl.listMovements);

// Export Excel de l'inventaire complet
router.get('/inventory/export', ctrl.exportInventoryXlsx);

// Étiquettes
router.post('/labels', ctrl.labelsSheet);

// Variantes
router.get('/variants', ctrl.listVariants);
router.get('/variants/by-barcode/:barcode', ctrl.getVariantByBarcode);
router.get('/variants/:variantId/label', ctrl.variantLabel);
router.post('/variants/:variantId/replenish', ctrl.replenishVariant);
router.post('/variants/:variantId/adjust', ctrl.adjustVariant);
router.post('/variants/:variantId/transfer', ctrl.transferVariant);
router.put('/variants/:variantId', ctrl.updateVariant);
router.delete('/variants/:variantId', ctrl.deleteVariant);

// Catalogue — morceaux
router.get('/items', ctrl.listItems);
router.post('/items', ctrl.createItem);
router.get('/items/:id', ctrl.getItem);
router.post('/items/:id/image', imageUpload.single('image'), ctrl.uploadItemImage);
router.put('/items/:id', ctrl.updateItem);
router.delete('/items/:id', ctrl.deleteItem);
router.get('/items/:id/variants', (req, res, next) => {
  (req.query as any).itemId = req.params.id;
  return ctrl.listVariants(req, res, next);
});
router.post('/items/:id/variants', ctrl.createVariant);

// Remises (prêts)
router.get('/issuances', iss.listIssuances);
router.post('/issuances', iss.createIssuance);
router.get('/issuances/:id', iss.getIssuance);
router.put('/issuances/:id', iss.updateIssuance);
router.post('/issuances/:id/finalize', iss.finalizeIssuance);
router.post('/issuances/:id/send-sms', iss.sendIssuanceSms);
router.post('/issuances/:id/counter-sign', iss.counterSignIssuance);
router.post('/issuances/:id/cancel', iss.cancelIssuance);
router.post('/issuances/:id/close-termination', iss.closeTermination);
router.get('/issuances/:id/pdf', iss.getIssuancePdfUrl);
router.post('/issuances/:id/upload-pdf', pdfUpload.single('pdf'), iss.uploadIssuancePdf);

// Retours
router.post('/returns', ret.createReturn);
router.get('/returns/:id', ret.getReturn);
router.post('/returns/:id/finalize', ret.finalizeReturn);
router.post('/returns/:id/send-sms', ret.sendReturnSms);
router.post('/returns/:id/counter-sign', ret.counterSignReturn);
router.get('/returns/:id/pdf', ret.getReturnPdfUrl);

// Lots de lavage (V2)
router.get('/wash-batches', wash.list);
router.post('/wash-batches', wash.create);
router.get('/wash-batches/:id', wash.get);
router.post('/wash-batches/:id/items', wash.addItems);
router.post('/wash-batches/:id/send', wash.send);
router.post('/wash-batches/:id/return', wash.ret);
router.post('/wash-batches/:id/inspect', wash.inspect);
router.post('/wash-batches/:id/inspect-all-good', wash.inspectAllGood);
router.post('/wash-batches/:id/cancel', wash.cancel);

// Fiche agent & règlements
router.get('/employees/:employeeId/holdings', ret.getHoldings);
router.get('/employees/:employeeId/fiche', ctrl.employeeFiche);
router.post('/employees/:employeeId/settlements', ctrl.createSettlement);

export default router;
