import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { getCache, setCache } from '../config/cache';

const DASHBOARD_OVERVIEW_CACHE_KEY = 'dashboard:overview';

/** Début de la semaine courante (lundi 00:00, heure serveur). */
function startOfWeek(now = new Date()): Date {
  const d = new Date(now);
  const day = d.getDay(); // 0 = dimanche, 1 = lundi, ...
  const diff = (day === 0 ? -6 : 1) - day; // ramène au lundi
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Début du mois courant (1er à 00:00). */
function startOfMonth(now = new Date()): Date {
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Vue d'ensemble du tableau de bord : agrège les données NON couvertes par
 * /api/candidates/stats/summary et /api/prospects/stats/summary
 * (catalogues, conversions, employés, fil d'activité récent).
 *
 * GET /api/dashboard/overview
 */
export const getDashboardOverview = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const cached = await getCache<any>(DASHBOARD_OVERVIEW_CACHE_KEY);
    if (cached) {
      return res.json(cached);
    }

    const weekStart = startOfWeek();
    const monthStart = startOfMonth();

    const [
      cataloguesTotal,
      cataloguesThisWeek,
      conversionsTotal,
      conversionsThisMonth,
      employeesTotal,
      employeesActive,
      recentActivityRaw,
    ] = await prisma.$transaction([
      prisma.catalogue.count(),
      prisma.catalogue.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.prospectCandidate.count({ where: { isDeleted: false, isConverted: true } }),
      prisma.prospectCandidate.count({
        where: { isDeleted: false, isConverted: true, convertedAt: { gte: monthStart } },
      }),
      prisma.employee.count({ where: { isDeleted: false } }),
      prisma.employee.count({ where: { isDeleted: false, status: 'ACTIF' } }),
      prisma.auditLog.findMany({
        where: { action: { not: 'READ' } },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          id: true,
          action: true,
          resource: true,
          resourceId: true,
          details: true,
          createdAt: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    const recentActivity = recentActivityRaw.map((log) => {
      const name =
        [log.user?.firstName, log.user?.lastName].filter(Boolean).join(' ').trim() ||
        log.user?.email ||
        'Utilisateur';
      return {
        id: log.id,
        action: log.action,
        resource: log.resource,
        resourceId: log.resourceId,
        details: log.details,
        createdAt: log.createdAt,
        user: { name },
      };
    });

    const payload = {
      success: true,
      data: {
        catalogues: { total: cataloguesTotal, createdThisWeek: cataloguesThisWeek },
        conversions: { total: conversionsTotal, convertedThisMonth: conversionsThisMonth },
        employees: { total: employeesTotal, active: employeesActive },
        recentActivity,
      },
    };

    await setCache(DASHBOARD_OVERVIEW_CACHE_KEY, payload, 300);

    res.json(payload);
  } catch (error) {
    next(error);
  }
};
