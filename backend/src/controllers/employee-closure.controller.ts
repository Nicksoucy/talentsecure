import { Request, Response, NextFunction } from 'express';
import { invalidateCaches } from '../utils/cacheInvalidation';
import { EMPLOYEE_MAPPOINTS_CACHE_KEY } from '../services/addressGeocode.service';
import {
  closeSilently,
  getClosureOverview,
  previewClosure,
  resendClosureNotice,
  sendClosure,
} from '../services/employee-file-closure.service';

const signerOf = (req: Request) => ({
  id: req.user?.id ?? null,
  firstName: req.user?.firstName ?? null,
  lastName: req.user?.lastName ?? null,
});

/** GET /api/employees/:id/closure — valeurs par défaut, uniformes détenus, historique. */
export const getEmployeeClosure = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ data: await getClosureOverview(req.params.id) });
  } catch (error) {
    next(error);
  }
};

/** POST /api/employees/:id/closure/preview — courriel + texto tels qu'ils partiront. */
export const previewEmployeeClosure = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ data: await previewClosure(req.params.id, req.body, signerOf(req)) });
  } catch (error) {
    next(error);
  }
};

/** POST /api/employees/:id/closure — ferme le dossier et envoie l'avis. */
export const sendEmployeeClosure = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { notice } = await sendClosure(req.params.id, req.body, signerOf(req));
    await invalidateCaches({ statKeys: [EMPLOYEE_MAPPOINTS_CACHE_KEY] });
    const { htmlSnapshot: _html, ...data } = notice;
    res.status(201).json({ message: 'Dossier fermé', data });
  } catch (error) {
    next(error);
  }
};

/** POST /api/employees/:id/closure/silent — ferme le dossier sans rien envoyer. */
export const closeEmployeeSilently = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await closeSilently(req.params.id, req.body, signerOf(req));
    await invalidateCaches({ statKeys: [EMPLOYEE_MAPPOINTS_CACHE_KEY] });
    res.status(201).json({ message: 'Dossier fermé (rien n’a été envoyé)', data });
  } catch (error) {
    next(error);
  }
};

/** POST /api/employees/:id/closure/:noticeId/resend — renvoie les canaux en échec. */
export const resendEmployeeClosure = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notice = await resendClosureNotice(req.params.id, req.params.noticeId);
    const { htmlSnapshot: _html, ...data } = notice;
    res.json({ message: 'Avis renvoyé', data });
  } catch (error) {
    next(error);
  }
};
