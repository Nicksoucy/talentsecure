import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';
import { findContactEverywhere } from '../utils/candidateMatch';
import { resolveSearchIds, hasSearchTokens } from '../utils/search';
import { getCache, setCache } from '../config/cache';
import { invalidateCaches } from '../utils/cacheInvalidation';
import { boundingBox, buildGeoMapPoints, haversineKm } from '../utils/geo';
import {
  EMPLOYEE_MAPPOINTS_CACHE_KEY,
  geocodeEmployeeById,
} from '../services/addressGeocode.service';
import {
  buildDeactivationFields,
  propagateUniformOffboarding,
  revertUniformOffboarding,
  UniformOffboardingWarning,
} from '../services/employee-offboarding.service';

/** Invalidation du cache carte (les mutations changent les points affichés). */
const invalidateEmployeeCaches = () =>
  invalidateCaches({ statKeys: [EMPLOYEE_MAPPOINTS_CACHE_KEY] });

/**
 * Indicateur « brouillon de remise d'uniforme » : pour chaque employé de la
 * page, compte les remises d'uniforme en statut DRAFT (préparées d'avance,
 * pas encore finalisées). Le lien employeeId est lâche (pas de FK), donc on
 * compte par groupBy sur les ids de la page courante (rapide, index status).
 */
async function withDraftCounts<T extends { id: string }>(employees: T[]) {
  const pageIds = employees.map((e) => e.id);
  const draftGroups = pageIds.length
    ? await prisma.uniformIssuance.groupBy({
        by: ['employeeId'],
        where: { employeeId: { in: pageIds }, status: 'DRAFT' },
        _count: true,
      })
    : [];
  const draftCountByEmployee = new Map(draftGroups.map((g) => [g.employeeId, g._count]));
  return employees.map((e) => ({
    ...e,
    draftIssuanceCount: draftCountByEmployee.get(e.id) ?? 0,
  }));
}

/**
 * Liste des employés (avec pagination, recherche, filtre statut).
 */
export const getEmployees = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      search,
      status,
      city,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const where: any = { isDeleted: false };

    if (status) where.status = status;
    if (city) where.city = { contains: city as string, mode: 'insensitive' };
    // Recherche tokenisée / insensible aux accents / téléphone normalisé + repli flou.
    if (search && hasSearchTokens(String(search))) {
      where.id = { in: await resolveSearchIds('employees', String(search)) };
    }

    // ── Recherche par RAYON autour d'un point (nearLat/nearLng/nearRadiusKm) ──
    // Liste triée du plus proche au plus loin (distanceKm), mêmes filtres.
    // Pas de PostGIS : pré-filtre bounding-box (index lat/lng) puis haversine
    // exact en Node ; pagination en mémoire (même patron que les candidats).
    const nearLat = Number(req.query.nearLat);
    const nearLng = Number(req.query.nearLng);
    const nearRadiusKm = Number(req.query.nearRadiusKm);
    if (
      Number.isFinite(nearLat) &&
      Number.isFinite(nearLng) &&
      Number.isFinite(nearRadiusKm) &&
      nearRadiusKm > 0
    ) {
      const center = { lat: nearLat, lng: nearLng };
      const box = boundingBox(center, nearRadiusKm);
      const rows = await prisma.employee.findMany({
        where: {
          ...where,
          lat: { gte: box.latMin, lte: box.latMax },
          lng: { gte: box.lngMin, lte: box.lngMax },
        },
      });
      const sorted = rows
        .map((e) => ({
          ...e,
          distanceKm:
            Math.round(
              haversineKm(center, { lat: e.lat as number, lng: e.lng as number }) * 10
            ) / 10,
        }))
        .filter((e) => e.distanceKm <= nearRadiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);

      const total = sorted.length;
      const pageRows = sorted.slice(skip, skip + Number(limit));
      return res.json({
        data: await withDraftCounts(pageRows),
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    }

    const [total, employees] = await prisma.$transaction([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
    ]);

    res.json({
      data: await withDraftCounts(employees),
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getEmployeeById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee || employee.isDeleted) {
      throw new ApiError(404, 'Employé non trouvé');
    }
    res.json({ data: employee });
  } catch (error) {
    next(error);
  }
};

export const getEmployeesStats = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [total, actifs, inactifs] = await prisma.$transaction([
      prisma.employee.count({ where: { isDeleted: false } }),
      prisma.employee.count({ where: { isDeleted: false, status: 'ACTIF' } }),
      prisma.employee.count({ where: { isDeleted: false, status: 'INACTIF' } }),
    ]);
    res.json({ data: { total, actifs, inactifs } });
  } catch (error) {
    next(error);
  }
};

/**
 * Points carte des agents ACTIFS, regroupés par coordonnées individuelles —
 * adresse exacte (source 'address', libellé = noms des agents), centroïde du
 * secteur postal ('postal') ou centre-ville ('city'). Même enveloppe que les
 * cartes candidats/prospects (GeoPointsMap côté frontend).
 */
export const getEmployeesMapPoints = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const cached = await getCache<{ success: boolean; data: any }>(
      EMPLOYEE_MAPPOINTS_CACHE_KEY
    );
    if (cached) {
      return res.json(cached);
    }

    const employees = await prisma.employee.findMany({
      where: { isDeleted: false, status: 'ACTIF' },
      select: {
        lat: true,
        lng: true,
        geocodeSource: true,
        postalCode: true,
        city: true,
        firstName: true,
        lastName: true,
      },
    });

    const rows = employees.map((e) => ({
      ...e,
      name: `${e.firstName} ${e.lastName}`.trim(),
    }));
    const { points, unplaced } = buildGeoMapPoints(rows, { nameLabelSources: ['address'] });

    const payload = { success: true, data: { points, unplaced } };
    await setCache(EMPLOYEE_MAPPOINTS_CACHE_KEY, payload, 300);

    res.json(payload);
  } catch (error) {
    next(error);
  }
};

/**
 * Créer un employé manuellement (dédup par email/téléphone).
 */
export const createEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, phone } = req.body;

    // DÉTECTION DE DOUBLON : un contact ne doit vivre qu'à une seule place
    // (Employé / Candidat / Prospect). Si trouvé → 409, le frontend proposera
    // de déplacer le contact.
    const conflict = await findContactEverywhere(prisma, email, phone);
    if (conflict) {
      return res.status(409).json({
        error: `Ce contact existe déjà (${conflict.firstName} ${conflict.lastName}).`,
        conflict,
      });
    }

    const employee = await prisma.employee.create({ data: buildEmployeeData(req.body) });
    await invalidateEmployeeCaches();
    // Géocodage en arrière-plan — la réponse n'attend pas Nominatim.
    void geocodeEmployeeById(employee.id);
    res.status(201).json({ message: 'Employé créé', data: employee });
  } catch (error) {
    next(error);
  }
};

export const updateEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) {
      throw new ApiError(404, 'Employé non trouvé');
    }

    const data = buildEmployeeData(req.body, true);

    // Transitions de statut → offboarding uniformes (logique partagée avec le
    // script d'import Agendrix : services/employee-offboarding.service).
    const becomingInactive = existing.status === 'ACTIF' && data.status === 'INACTIF';
    const becomingActive = existing.status === 'INACTIF' && data.status === 'ACTIF';

    let deadline: Date | null = null;
    if (becomingInactive) {
      const fields = buildDeactivationFields(existing);
      deadline = fields.uniformReturnDeadlineAt;
      data.terminationDate = fields.terminationDate;
      data.uniformReturnDeadlineAt = fields.uniformReturnDeadlineAt;
    } else if (becomingActive) {
      // Réactivation : on efface les ancres de fin d'emploi.
      data.terminationDate = null;
      data.uniformReturnDeadlineAt = null;
    }

    const employee = await prisma.employee.update({ where: { id }, data });

    let uniformWarning: UniformOffboardingWarning | undefined;
    if (becomingInactive && deadline) {
      uniformWarning = await propagateUniformOffboarding(id, deadline);
    } else if (becomingActive && existing.uniformReturnDeadlineAt) {
      await revertUniformOffboarding(id, existing.uniformReturnDeadlineAt);
    }

    await invalidateEmployeeCaches();
    // Re-géocodage en arrière-plan seulement si un champ d'adresse a changé.
    const addressChanged = (['address', 'city', 'province', 'postalCode'] as const).some(
      (k) => k in data && data[k] !== existing[k]
    );
    if (addressChanged) {
      void geocodeEmployeeById(id);
    }

    res.json({
      message: 'Employé mis à jour',
      data: employee,
      ...(uniformWarning ? { uniformWarning } : {}),
    });
  } catch (error) {
    next(error);
  }
};

export const deleteEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) {
      throw new ApiError(404, 'Employé non trouvé');
    }
    await prisma.employee.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    await invalidateEmployeeCaches();
    res.json({ message: 'Employé supprimé' });
  } catch (error) {
    next(error);
  }
};

/**
 * Promouvoir un Candidat en Employé.
 * - Crée la fiche Employé à partir du Candidat (CV, vidéo, BSP, etc.).
 * - Soft-delete le Candidat (il disparaît de Candidats).
 * - Masque tout prospect lié (converti) — l'Employé gagne sur tout.
 */
export const promoteCandidateToEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { candidateId } = req.params;
    const { hireDate, position, assignment, employeeNumber } = req.body;

    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate || candidate.isDeleted) {
      throw new ApiError(404, 'Candidat non trouvé');
    }

    // Déjà employé ? (par email/téléphone)
    const or: any[] = [];
    if (candidate.email) or.push({ email: { equals: candidate.email, mode: 'insensitive' as const } });
    if (candidate.phone) or.push({ phone: candidate.phone });
    if (or.length > 0) {
      const existingEmp = await prisma.employee.findFirst({ where: { isDeleted: false, OR: or } });
      if (existingEmp) {
        return res.status(200).json({
          message: 'Cette personne est déjà un employé.',
          data: existingEmp,
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          phone: candidate.phone,
          address: candidate.address,
          city: candidate.city,
          province: candidate.province,
          postalCode: candidate.postalCode,
          status: 'ACTIF',
          hireDate: hireDate ? new Date(hireDate) : new Date(),
          position: position || null,
          assignment: assignment || null,
          employeeNumber: employeeNumber || null,
          hasBSP: candidate.hasBSP,
          bspNumber: candidate.bspNumber,
          bspExpiryDate: candidate.bspExpiryDate,
          hasVehicle: candidate.hasVehicle,
          cvUrl: candidate.cvUrl,
          cvStoragePath: candidate.cvStoragePath,
          videoUrl: candidate.videoUrl,
          videoStoragePath: candidate.videoStoragePath,
          notes: candidate.hrNotes,
          convertedFromCandidateId: candidate.id,
        },
      });

      // Le candidat sort de la liste Candidats
      await tx.candidate.update({
        where: { id: candidate.id },
        data: { isDeleted: true, deletedAt: new Date() },
      });

      // Masquer tout prospect lié (l'employé gagne sur le prospect aussi)
      const prospOr: any[] = [];
      if (candidate.email) prospOr.push({ email: { equals: candidate.email, mode: 'insensitive' as const } });
      if (candidate.phone) prospOr.push({ phone: candidate.phone });
      if (prospOr.length > 0) {
        await tx.prospectCandidate.updateMany({
          where: { isDeleted: false, isConverted: false, OR: prospOr },
          data: { isConverted: true, convertedAt: new Date(), convertedToId: candidate.id },
        });
      }

      return employee;
    });

    await invalidateEmployeeCaches();
    void geocodeEmployeeById(result.id);

    res.status(201).json({
      message: 'Candidat promu en employé. Retiré de Candidats et Candidats Potentiels.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Promouvoir un Candidat Potentiel (Prospect) directement en Employé.
 * Saute l'étape Candidat — utile quand un prospect est validé/embauché direct.
 * - Crée la fiche Employé depuis les données du prospect.
 * - Marque le prospect comme converti + soft-delete (il disparaît de la liste).
 */
export const promoteProspectToEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prospectId } = req.params;
    const { hireDate, position, assignment, employeeNumber } = req.body || {};

    const prospect = await prisma.prospectCandidate.findUnique({ where: { id: prospectId } });
    if (!prospect || prospect.isDeleted) {
      throw new ApiError(404, 'Candidat potentiel non trouvé');
    }

    // Déjà employé ? (par email/téléphone)
    const or: any[] = [];
    if (prospect.email) or.push({ email: { equals: prospect.email, mode: 'insensitive' as const } });
    if (prospect.phone) or.push({ phone: prospect.phone });
    if (or.length > 0) {
      const existingEmp = await prisma.employee.findFirst({ where: { isDeleted: false, OR: or } });
      if (existingEmp) {
        return res.status(200).json({
          message: 'Cette personne est déjà un employé.',
          data: existingEmp,
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          firstName: prospect.firstName,
          lastName: prospect.lastName,
          email: prospect.email,
          phone: prospect.phone,
          address: prospect.streetAddress,
          city: prospect.city,
          province: prospect.province || 'QC',
          postalCode: prospect.postalCode,
          status: 'ACTIF',
          hireDate: hireDate ? new Date(hireDate) : new Date(),
          position: position || null,
          assignment: assignment || null,
          employeeNumber: employeeNumber || null,
          hasBSP: false,
          hasVehicle: false,
          cvUrl: prospect.cvUrl,
          cvStoragePath: prospect.cvStoragePath,
          videoUrl: prospect.videoUrl,
          videoStoragePath: prospect.videoStoragePath,
          notes: prospect.notes,
        },
      });

      // Marquer le prospect : converti + soft-delete (sort de la liste)
      await tx.prospectCandidate.update({
        where: { id: prospect.id },
        data: {
          isConverted: true,
          convertedAt: new Date(),
          convertedToId: employee.id,
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      return employee;
    });

    await invalidateEmployeeCaches();
    void geocodeEmployeeById(result.id);

    res.status(201).json({
      message: 'Candidat potentiel promu directement en employé. Retiré de Candidats Potentiels.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

function buildEmployeeData(body: any, isUpdate = false) {
  const data: any = {
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email ?? null,
    phone: body.phone,
    address: body.address ?? null,
    city: body.city ?? null,
    province: body.province || 'QC',
    postalCode: body.postalCode ?? null,
    status: body.status || 'ACTIF',
    hireDate: body.hireDate ? new Date(body.hireDate) : null,
    employeeNumber: body.employeeNumber ?? null,
    position: body.position ?? null,
    assignment: body.assignment ?? null,
    hasBSP: body.hasBSP ?? false,
    bspNumber: body.bspNumber ?? null,
    hasVehicle: body.hasVehicle ?? false,
    cvUrl: body.cvUrl ?? null,
    notes: body.notes ?? null,
  };
  // En update, ne pas écraser avec des valeurs absentes
  if (isUpdate) {
    Object.keys(data).forEach((k) => {
      if (body[k] === undefined) delete data[k];
    });
  }
  return data;
}
