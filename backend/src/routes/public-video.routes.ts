import { Router } from 'express';
import {
  getVideoSession,
  initiateVideoUpload,
  completeVideoUpload,
} from '../controllers/public-video.controller';
import { validate } from '../middleware/validation.middleware';
import { videoUploadLimiter } from '../middleware/rate-limit.middleware';
import {
  completeUploadSchema,
  initiateUploadSchema,
  videoSessionQuerySchema,
} from '../validation/public-video.validation';

/**
 * Téléversement public de la vidéo de présentation (page /ma-video).
 *
 * AUCUNE authentification : le candidat n'a pas de compte. Le contrôle d'accès
 * repose sur le contactId GHL (chaîne opaque non devinable) revalidé contre
 * l'API GHL à chaque appel, plus un rate limit par IP. Même approche que
 * `GET /api/catalogues/view/:token`.
 *
 * Ce fichier ne doit jamais importer de middleware d'auth : si vous en ajoutez
 * un, les candidats ne peuvent plus envoyer leur vidéo.
 */
const router = Router();

router.use(videoUploadLimiter);

/**
 * @route   GET /api/public/video/session
 * @desc    Valide le lien, renvoie le prénom et l'état du téléversement
 * @access  Public — lien opaque + rate limit
 */
router.get('/session', validate({ query: videoSessionQuerySchema }), getVideoSession);

/**
 * @route   POST /api/public/video/initiate
 * @desc    URL présignée PUT vers R2 (type et taille figés)
 * @access  Public — lien opaque + rate limit
 */
router.post('/initiate', validate({ body: initiateUploadSchema }), initiateVideoUpload);

/**
 * @route   POST /api/public/video/complete
 * @desc    Confirme le téléversement, vérifie le contenu, gare l'upload
 * @access  Public — lien opaque + rate limit
 */
router.post('/complete', validate({ body: completeUploadSchema }), completeVideoUpload);

export default router;
