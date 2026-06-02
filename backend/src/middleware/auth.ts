import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { User, UserRole } from '@prisma/client';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      role: UserRole;
      firstName: string;
      lastName: string;
    }
  }
}

/**
 * Middleware pour authentifier avec JWT
 */
export const authenticateJWT = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  passport.authenticate('jwt', { session: false }, (err: any, user: User) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur d\'authentification' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    req.user = user;
    next();
  })(req, res, next);
};

/**
 * Middleware pour vérifier les rôles
 */
export const authorizeRoles = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Accès refusé - permissions insuffisantes'
      });
    }

    next();
  };
};

/**
 * Garde par MÉTHODE : autorise des rôles différents en lecture (GET/HEAD) et en
 * écriture (POST/PUT/PATCH/DELETE).
 *
 * INVARIANT IMPORTANT : aucune route GET/HEAD ne doit muter l'état. Sinon un
 * rôle « lecture seule » (ex. MAGASIN) pourrait écrire via une telle route.
 */
export const authorizeReadWrite = (
  readRoles: UserRole[],
  writeRoles: UserRole[]
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    const isRead = req.method === 'GET' || req.method === 'HEAD';
    const allowed = isRead ? readRoles : writeRoles;
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé - permissions insuffisantes' });
    }
    next();
  };
};

/**
 * Middleware optionnel JWT (ne rejette pas si pas authentifié)
 */
export const optionalJWT = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  passport.authenticate('jwt', { session: false }, (err: any, user: User) => {
    if (user) {
      req.user = user;
    }
    next();
  })(req, res, next);
};
