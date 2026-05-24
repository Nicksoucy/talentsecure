import { PrismaClient } from '@prisma/client';

export interface MatchedCandidate {
  id: string;
  firstName: string;
  lastName: string;
}

/**
 * Le Candidat gagne TOUJOURS : si une personne existe déjà dans la table
 * Candidate (non supprimée), elle ne doit pas (re)vivre dans Candidats
 * Potentiels (ProspectCandidate).
 *
 * Correspondance par email (insensible à la casse) OU téléphone. Le téléphone
 * est comparé en exact PUIS sur les 10 derniers chiffres, car les formats
 * varient (+14385551234, (438) 555-1234, 438-555-1234, etc.).
 *
 * Retourne le candidat correspondant, ou null.
 */
export async function findMatchingCandidate(
  prisma: PrismaClient,
  email?: string | null,
  phone?: string | null
): Promise<MatchedCandidate | null> {
  const cleanEmail = (email || '').trim();
  const cleanPhone = (phone || '').trim();
  const digits = cleanPhone.replace(/\D/g, '').slice(-10);

  const or: any[] = [];
  if (cleanEmail) or.push({ email: { equals: cleanEmail, mode: 'insensitive' as const } });
  if (cleanPhone) or.push({ phone: cleanPhone });

  if (or.length === 0) return null;

  // 1) Match rapide : email exact (insensible) OU téléphone exact
  const exact = await prisma.candidate.findFirst({
    where: { isDeleted: false, OR: or },
    select: { id: true, firstName: true, lastName: true },
  });
  if (exact) return exact;

  // 2) Fallback : téléphone par 10 derniers chiffres (formats différents).
  //    La table Candidate est petite (quelques centaines) — fetch acceptable.
  if (digits.length === 10) {
    const candidates = await prisma.candidate.findMany({
      where: { isDeleted: false, phone: { not: '' } },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    const match = candidates.find(
      (c) => (c.phone || '').replace(/\D/g, '').slice(-10) === digits
    );
    if (match) {
      return { id: match.id, firstName: match.firstName, lastName: match.lastName };
    }
  }

  return null;
}

export interface MatchedEmployee {
  id: string;
  firstName: string;
  lastName: string;
}

/**
 * L'Employé gagne TOUJOURS : si une personne existe déjà dans la table
 * Employee (non supprimée), elle ne doit pas (re)vivre dans Candidats ni
 * Candidats Potentiels.
 *
 * Même logique de correspondance que findMatchingCandidate : email
 * (insensible) OU téléphone (exact puis 10 derniers chiffres).
 */
export async function findMatchingEmployee(
  prisma: PrismaClient,
  email?: string | null,
  phone?: string | null
): Promise<MatchedEmployee | null> {
  const cleanEmail = (email || '').trim();
  const cleanPhone = (phone || '').trim();
  const digits = cleanPhone.replace(/\D/g, '').slice(-10);

  const or: any[] = [];
  if (cleanEmail) or.push({ email: { equals: cleanEmail, mode: 'insensitive' as const } });
  if (cleanPhone) or.push({ phone: cleanPhone });

  if (or.length === 0) return null;

  const exact = await prisma.employee.findFirst({
    where: { isDeleted: false, OR: or },
    select: { id: true, firstName: true, lastName: true },
  });
  if (exact) return exact;

  if (digits.length === 10) {
    const employees = await prisma.employee.findMany({
      where: { isDeleted: false, phone: { not: '' } },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    const match = employees.find(
      (e) => (e.phone || '').replace(/\D/g, '').slice(-10) === digits
    );
    if (match) {
      return { id: match.id, firstName: match.firstName, lastName: match.lastName };
    }
  }

  return null;
}

export interface MatchedProspect {
  id: string;
  firstName: string;
  lastName: string;
}

/**
 * Cherche un Candidat Potentiel (ProspectCandidate) visible (non supprimé, non
 * converti) correspondant à un email OU téléphone. Même logique de matching.
 */
export async function findMatchingProspect(
  prisma: PrismaClient,
  email?: string | null,
  phone?: string | null
): Promise<MatchedProspect | null> {
  const cleanEmail = (email || '').trim();
  const cleanPhone = (phone || '').trim();
  const digits = cleanPhone.replace(/\D/g, '').slice(-10);

  const or: any[] = [];
  if (cleanEmail) or.push({ email: { equals: cleanEmail, mode: 'insensitive' as const } });
  if (cleanPhone) or.push({ phone: cleanPhone });
  if (or.length === 0) return null;

  const exact = await prisma.prospectCandidate.findFirst({
    where: { isDeleted: false, isConverted: false, OR: or },
    select: { id: true, firstName: true, lastName: true },
  });
  if (exact) return exact;

  if (digits.length === 10) {
    const prospects = await prisma.prospectCandidate.findMany({
      where: { isDeleted: false, isConverted: false, phone: { not: '' } },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    const match = prospects.find(
      (p) => (p.phone || '').replace(/\D/g, '').slice(-10) === digits
    );
    if (match) return { id: match.id, firstName: match.firstName, lastName: match.lastName };
  }
  return null;
}

export type ContactSection = 'employee' | 'candidate' | 'prospect';

export interface FoundContact {
  section: ContactSection;
  id: string;
  firstName: string;
  lastName: string;
}

/**
 * Cherche un contact dans LES TROIS sections (par email OU téléphone), dans
 * l'ordre de priorité Employé → Candidat → Prospect. Sert à la détection de
 * doublon à la création manuelle : un contact ne doit vivre qu'à une place.
 */
export async function findContactEverywhere(
  prisma: PrismaClient,
  email?: string | null,
  phone?: string | null,
  exclude?: { section: ContactSection; id: string }
): Promise<FoundContact | null> {
  const emp = await findMatchingEmployee(prisma, email, phone);
  if (emp && !(exclude?.section === 'employee' && exclude.id === emp.id)) {
    return { section: 'employee', ...emp };
  }
  const cand = await findMatchingCandidate(prisma, email, phone);
  if (cand && !(exclude?.section === 'candidate' && exclude.id === cand.id)) {
    return { section: 'candidate', ...cand };
  }
  const prosp = await findMatchingProspect(prisma, email, phone);
  if (prosp && !(exclude?.section === 'prospect' && exclude.id === prosp.id)) {
    return { section: 'prospect', ...prosp };
  }
  return null;
}
