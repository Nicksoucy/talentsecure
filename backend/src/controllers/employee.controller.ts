import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { findContactEverywhere } from '../utils/candidateMatch';

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
    if (search) {
      where.OR = [
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string } },
        { assignment: { contains: search as string, mode: 'insensitive' } },
      ];
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
      data: employees,
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
      return res.status(404).json({ error: 'Employé non trouvé' });
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
      return res.status(404).json({ error: 'Employé non trouvé' });
    }
    const employee = await prisma.employee.update({
      where: { id },
      data: buildEmployeeData(req.body, true),
    });
    res.json({ message: 'Employé mis à jour', data: employee });
  } catch (error) {
    next(error);
  }
};

export const deleteEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) {
      return res.status(404).json({ error: 'Employé non trouvé' });
    }
    await prisma.employee.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
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
      return res.status(404).json({ error: 'Candidat non trouvé' });
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
      return res.status(404).json({ error: 'Candidat potentiel non trouvé' });
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
