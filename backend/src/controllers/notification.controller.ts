import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/apiError';
import { listForUser, markRead, markAllRead, dispatchPendingNotifications } from '../services/notification.service';

const userId = (req: Request): string => {
  const id = (req.user as any)?.id;
  if (!id) throw new ApiError(401, 'Non authentifié');
  return id;
};

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = req.query.limit ? Math.min(parseInt(String(req.query.limit), 10) || 30, 100) : 30;
    const result = await listForUser(userId(req), { unreadOnly, limit });
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};

export const readOne = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await markRead(req.params.id, userId(req));
    res.json({ message: 'Marquée comme lue' });
  } catch (error) {
    next(error);
  }
};

export const readAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await markAllRead(userId(req));
    res.json({ message: 'Toutes les notifications marquées comme lues' });
  } catch (error) {
    next(error);
  }
};

/**
 * Endpoint interne pour déclencher le dispatch manuellement (utile en test ou
 * comme fallback Cloud Scheduler). Protégé par un token simple (env INTERNAL_JOB_TOKEN).
 */
export const runDispatch = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers['x-internal-token'];
    const expected = process.env.INTERNAL_JOB_TOKEN;
    if (!expected || token !== expected) throw new ApiError(403, 'Token invalide');
    const result = await dispatchPendingNotifications();
    res.json({ message: 'Dispatch terminé', data: result });
  } catch (error) {
    next(error);
  }
};
