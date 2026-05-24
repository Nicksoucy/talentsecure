import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { findContactEverywhere, ContactSection } from '../utils/candidateMatch';
import { moveContact } from '../services/contact-move.service';

const VALID: ContactSection[] = ['employee', 'candidate', 'prospect'];

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
