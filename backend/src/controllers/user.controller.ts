import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { hashPassword } from '../utils/password';

const actorId = (req: Request): string => (req.user as any)?.id;

// Ne jamais renvoyer le hash du mot de passe.
const SAFE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

/** GET /api/users — liste des comptes staff (exclut les comptes CLIENT). */
export const listUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search } = req.query;
    const where: any = { role: { not: 'CLIENT' } };
    if (search) {
      const q = String(search);
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ];
    }
    const users = await prisma.user.findMany({ where, select: SAFE_SELECT, orderBy: { createdAt: 'desc' } });
    res.json({ data: users });
  } catch (error) {
    next(error);
  }
};

/** POST /api/users — crée un compte (calque auth.register). */
export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return res.status(400).json({ error: 'Cet email est déjà utilisé' });

    const hashed = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email: email.toLowerCase(), password: hashed, firstName, lastName, role: role || 'SALES' },
      select: SAFE_SELECT,
    });
    await prisma.auditLog.create({
      data: {
        userId: actorId(req),
        action: 'CREATE',
        resource: 'User',
        resourceId: user.id,
        details: `Utilisateur créé : ${user.email} (${user.role})`,
      },
    });
    res.status(201).json({ message: 'Utilisateur créé', data: user });
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/users/:id — infos / rôle / actif. */
export const updateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, role, isActive } = req.body;
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const me = actorId(req);

    // Garde-fous : pas de rétrogradation/désactivation de soi-même ni du dernier admin actif.
    const removingAdminRights = (role !== undefined && role !== 'ADMIN') || isActive === false;
    if (target.role === 'ADMIN' && removingAdminRights) {
      if (target.id === me) {
        return res.status(400).json({ error: 'Vous ne pouvez pas retirer vos propres droits administrateur ni vous désactiver.' });
      }
      const activeAdmins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (activeAdmins <= 1) {
        return res.status(400).json({ error: 'Impossible : il doit rester au moins un administrateur actif.' });
      }
    }

    const data: any = {};
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (email !== undefined) {
      const lower = email.toLowerCase();
      const dup = await prisma.user.findFirst({ where: { email: lower, id: { not: id } } });
      if (dup) return res.status(400).json({ error: 'Cet email est déjà utilisé' });
      data.email = lower;
    }
    if (role !== undefined) data.role = role;
    if (isActive !== undefined) data.isActive = isActive;

    const user = await prisma.user.update({ where: { id }, data, select: SAFE_SELECT });
    await prisma.auditLog.create({
      data: { userId: me, action: 'UPDATE', resource: 'User', resourceId: id, details: `Utilisateur modifié : ${user.email}` },
    });
    res.json({ message: 'Utilisateur mis à jour', data: user });
  } catch (error) {
    next(error);
  }
};

/** POST /api/users/:id/reset-password — définit un nouveau mot de passe. */
export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const hashed = await hashPassword(password);
    await prisma.user.update({ where: { id }, data: { password: hashed } });
    await prisma.auditLog.create({
      data: { userId: actorId(req), action: 'UPDATE', resource: 'User', resourceId: id, details: `Mot de passe réinitialisé : ${target.email}` },
    });
    res.json({ message: 'Mot de passe réinitialisé' });
  } catch (error) {
    next(error);
  }
};
