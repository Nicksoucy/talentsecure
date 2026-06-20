import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { findContactEverywhere, ContactSection } from '../utils/candidateMatch';
import { moveContact } from '../services/contact-move.service';
import { searchTableIds, hasSearchTokens } from '../utils/search';

const VALID: ContactSection[] = ['employee', 'candidate', 'prospect'];

/** Rôles autorisés à voir candidats + prospects (sinon : employés seulement). */
const CAN_SEE_RECRUITING = new Set(['ADMIN', 'RH_RECRUITER', 'SALES']);

const PERSON_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;

/**
 * Recherche transversale (nom/email/téléphone tokenisé, accent-insensible, repli
 * flou) dans les 3 tables — partagée par le bandeau « trouvé ailleurs » et
 * l'omnibox Cmd+K. On ne compte/retourne que les fiches non supprimées (mais on
 * inclut archivés/convertis/inactifs : le but est « cette personne existe »).
 */
async function visibleIds(table: 'candidates' | 'employees' | 'prospect_candidates', q: string): Promise<string[]> {
  return hasSearchTokens(q) ? searchTableIds(table, q) : [];
}

/**
 * GET /api/contacts/search-count?q=
 * → { employees, candidates, prospects } : nb de fiches correspondantes par table.
 */
export const searchPeopleCount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q || '');
    const canRecruiting = CAN_SEE_RECRUITING.has(req.user?.role || '');

    if (!hasSearchTokens(q)) {
      return res.json({ data: { employees: 0, candidates: 0, prospects: 0 } });
    }

    const [empIds, candIds, prosIds] = await Promise.all([
      visibleIds('employees', q),
      canRecruiting ? visibleIds('candidates', q) : Promise.resolve([] as string[]),
      canRecruiting ? visibleIds('prospect_candidates', q) : Promise.resolve([] as string[]),
    ]);

    const [employees, candidates, prospects] = await Promise.all([
      empIds.length ? prisma.employee.count({ where: { id: { in: empIds }, isDeleted: false } }) : 0,
      candIds.length ? prisma.candidate.count({ where: { id: { in: candIds }, isDeleted: false } }) : 0,
      prosIds.length ? prisma.prospectCandidate.count({ where: { id: { in: prosIds }, isDeleted: false } }) : 0,
    ]);

    res.json({ data: { employees, candidates, prospects } });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/contacts/search?q=&limit=
 * → { employees:[], candidates:[], prospects:[] } : top-N fiches par table
 *   (id, firstName, lastName, email, section) pour l'omnibox global.
 */
export const searchPeople = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q || '');
    const take = Math.min(Math.max(Number(req.query.limit) || 6, 1), 10);
    const canRecruiting = CAN_SEE_RECRUITING.has(req.user?.role || '');

    if (!hasSearchTokens(q)) {
      return res.json({ data: { employees: [], candidates: [], prospects: [] } });
    }

    const [empIds, candIds, prosIds] = await Promise.all([
      visibleIds('employees', q),
      canRecruiting ? visibleIds('candidates', q) : Promise.resolve([] as string[]),
      canRecruiting ? visibleIds('prospect_candidates', q) : Promise.resolve([] as string[]),
    ]);

    const [employees, candidates, prospects] = await Promise.all([
      empIds.length
        ? prisma.employee.findMany({ where: { id: { in: empIds }, isDeleted: false }, select: PERSON_SELECT, take })
        : [],
      candIds.length
        ? prisma.candidate.findMany({ where: { id: { in: candIds }, isDeleted: false }, select: PERSON_SELECT, take })
        : [],
      prosIds.length
        ? prisma.prospectCandidate.findMany({ where: { id: { in: prosIds }, isDeleted: false }, select: PERSON_SELECT, take })
        : [],
    ]);

    res.json({
      data: {
        employees: employees.map((r) => ({ ...r, section: 'employee' as const })),
        candidates: candidates.map((r) => ({ ...r, section: 'candidate' as const })),
        prospects: prospects.map((r) => ({ ...r, section: 'prospect' as const })),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Recherche un contact (email OU téléphone) dans les 3 sections.
 * GET /api/contacts/lookup?email=&phone=
 */
export const lookupContact = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = (req.query.email as string) || null;
    const phone = (req.query.phone as string) || null;
    const found = await findContactEverywhere(prisma, email, phone);
    res.json({ data: found });
  } catch (error) {
    next(error);
  }
};

/**
 * Déplace un contact d'une section à une autre.
 * POST /api/contacts/move  body: { fromSection, fromId, toSection }
 */
export const moveContactController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fromSection, fromId, toSection } = req.body || {};

    if (!VALID.includes(fromSection) || !VALID.includes(toSection)) {
      return res.status(400).json({ error: 'Section invalide (employee | candidate | prospect)' });
    }
    if (!fromId) {
      return res.status(400).json({ error: 'fromId requis' });
    }

    const result = await moveContact({
      fromSection,
      fromId,
      toSection,
      createdById: req.user!.id,
    });

    res.json({ message: `Contact déplacé vers ${toSection}.`, data: result });
  } catch (error: any) {
    if (error?.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
};
