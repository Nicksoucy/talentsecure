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
