import { Router } from 'express';
import multer from 'multer';
import { authenticateJWT, authorizeReadWrite, authorizeRoles } from '../middleware/auth';
import { publicShareLimiter } from '../middleware/rate-limit.middleware';
import * as ctrl from '../controllers/uniform.controller';
import * as iss from '../controllers/uniform-issuance.controller';
import * as ret from '../controllers/uniform-return.controller';
import * as wash from '../controllers/uniform-wash-batch.controller';
import { validate } from '../middleware/validation.middleware';
import {
  replenishVariantSchema,
  adjustVariantSchema,
  transferVariantSchema,
  createSettlementSchema,
  createIssuanceSchema,
  createReturnSchema,
  createItemSchema,
  createVariantSchema,
} from '../validation/uniform.validation';

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

// -------------------------------------------------------------------------
// Préparation d'un BROUILLON de remise — ouverte à TOUTE l'équipe ayant accès
// au module (MAGASIN lecture seule incluse). Permet à n'importe qui de préparer
// d'avance les envois ; le magasin/gestion n'a plus qu'à ouvrir → finaliser →
// signer → envoyer. Cette route ne crée qu'un brouillon : AUCUN impact stock,
// AUCUNE signature, AUCUN SMS. La finalisation (décrément stock), la signature
// et l'envoi SMS restent réservées aux rôles d'écriture (cf. authorizeReadWrite
// + routes /finalize, /counter-sign, /send-sms ci-dessous).
// Déclarée AVANT le garde par méthode pour échapper au write-gate (POST).
router.post(
  '/issuances/draft',
  authorizeRoles('ADMIN', 'RH_RECRUITER', 'MAGASIN', 'MAGASIN_GESTION'),
  iss.createIssuance,
);

// Lecture (GET) : ADMIN, RH, MAGASIN (lecture seule). Écriture : ADMIN, RH.
// Invariant : toutes les lectures du module sont des GET, toutes les mutations
// sont POST/PUT/DELETE (cf. authorizeReadWrite).
// Lecture : ADMIN, RH, MAGASIN (lecture seule), MAGASIN_GESTION.
// Écriture : ADMIN, RH, MAGASIN_GESTION (gestion complète des uniformes).
router.use(authorizeReadWrite(
  ['ADMIN', 'RH_RECRUITER', 'MAGASIN', 'MAGASIN_GESTION'],
  ['ADMIN', 'RH_RECRUITER', 'MAGASIN_GESTION'],
));

// Stats & rapports
router.get('/stats/summary', ctrl.statsSummary);
router.get('/reports/stock', ctrl.reportStock);
router.get('/reports/overdue', ctrl.reportOverdue);
router.get('/reports/losses', ctrl.reportLosses);
router.get('/reports/inactive-holdings', ctrl.reportInactiveHoldings);

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
router.get('/variants/:variantId/qr', ctrl.variantQr);
router.post('/variants/:variantId/replenish', validate({ body: replenishVariantSchema }), ctrl.replenishVariant);
router.post('/variants/:variantId/adjust', validate({ body: adjustVariantSchema }), ctrl.adjustVariant);
router.post('/variants/:variantId/transfer', validate({ body: transferVariantSchema }), ctrl.transferVariant);
router.put('/variants/:variantId', ctrl.updateVariant);
router.delete('/variants/:variantId', ctrl.deleteVariant);

// Catalogue — morceaux
router.get('/items', ctrl.listItems);
router.post('/items', validate({ body: createItemSchema }), ctrl.createItem);
router.post('/items/reorder', ctrl.reorderItems);
router.get('/items/:id', ctrl.getItem);
router.post('/items/:id/image', imageUpload.single('image'), ctrl.uploadItemImage);
router.put('/items/:id', ctrl.updateItem);
router.delete('/items/:id', ctrl.deleteItem);
router.get('/items/:id/variants', (req, res, next) => {
  (req.query as any).itemId = req.params.id;
  return ctrl.listVariants(req, res, next);
});
router.post('/items/:id/variants/reorder', ctrl.reorderVariants);
router.post('/items/:id/variants', validate({ body: createVariantSchema }), ctrl.createVariant);

// Remises (prêts)
router.get('/issuances', iss.listIssuances);
router.post('/issuances', validate({ body: createIssuanceSchema }), iss.createIssuance);
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
router.post('/returns', validate({ body: createReturnSchema }), ret.createReturn);
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
router.post('/employees/:employeeId/settlements', validate({ body: createSettlementSchema }), ctrl.createSettlement);

export default router;
