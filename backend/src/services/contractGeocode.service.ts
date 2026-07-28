/**
 * Géocodage des personnes taguées sur un contrat, pour la couche colorée des
 * cartes.
 *
 * Réutilise la chaîne de résolution des employés (resolveEmployeeCoordinates :
 * adresse exacte → centroïde FSA → centre-ville), agnostique à l'entité, et
 * écrit lat/lng/geocodedAt/geocodeSource sur la fiche de la personne.
 *
 * IMPORTANT — on n'appelle JAMAIS fillMissingContactFieldsFromCoords ici. Le
 * remplissage inverse (coordonnées → ville/code postal) est réservé aux
 * employés placés à l'adresse exacte ; l'appliquer ailleurs a déjà fabriqué des
 * codes postaux inventés en prod (garde ajoutée en 5801610). Cette couche LIT
 * des adresses et ÉCRIT des coordonnées, rien d'autre.
 */
import { prisma } from '../config/database';
import logger from '../config/logger';
import { ContactSection } from '../utils/candidateMatch';
import { EmployeeGeocode, resolveEmployeeCoordinates } from './addressGeocode.service';
import { invalidateContractCaches } from './contractLeads.service';

/** Adresse d'une personne, quelle que soit sa section (le champ rue diffère). */
interface PersonAddress {
  address: string | null;
  city: string | null;
  postalCode: string | null;
}

async function readAddress(section: ContactSection, id: string): Promise<PersonAddress | null> {
  if (section === 'prospect') {
    const p = await prisma.prospectCandidate.findUnique({
      where: { id },
      // ProspectCandidate stocke la rue dans streetAddress (pas `address`).
      select: { streetAddress: true, city: true, postalCode: true },
    });
    return p ? { address: p.streetAddress, city: p.city, postalCode: p.postalCode } : null;
  }
  if (section === 'candidate') {
    const c = await prisma.candidate.findUnique({
      where: { id },
      select: { address: true, city: true, postalCode: true },
    });
    return c ? { address: c.address, city: c.city, postalCode: c.postalCode } : null;
  }
  const e = await prisma.employee.findUnique({
    where: { id },
    select: { address: true, city: true, postalCode: true },
  });
  return e ? { address: e.address, city: e.city, postalCode: e.postalCode } : null;
}

async function writeCoords(
  section: ContactSection,
  id: string,
  geo: EmployeeGeocode | null
): Promise<void> {
  const data = {
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    geocodedAt: new Date(),
    geocodeSource: geo?.source ?? null,
  };
  if (section === 'prospect') {
    await prisma.prospectCandidate.update({ where: { id }, data });
    return;
  }
  if (section === 'candidate') {
    await prisma.candidate.update({ where: { id }, data });
    return;
  }
  await prisma.employee.update({ where: { id }, data });
}

/**
 * Géocode une personne taguée et persiste ses coordonnées. Ne throw jamais →
 * sûr en boucle d'import (une adresse illisible ne doit pas arrêter le lot).
 */
export async function geocodeContractPerson(
  section: ContactSection,
  personId: string
): Promise<EmployeeGeocode | null> {
  try {
    const addr = await readAddress(section, personId);
    if (!addr) return null;

    const geo = await resolveEmployeeCoordinates(addr);
    await writeCoords(section, personId, geo);
    return geo;
  } catch (e: any) {
    logger.warn(`[geocode] ${section} ${personId} non géocodé: ${e?.message}`);
    return null;
  }
}

/**
 * Personnes taguées sur un contrat qui n'ont pas encore de coordonnées, toutes
 * sections confondues.
 *
 * C'est CE qui rend la phase de géocodage rejouable : on repart de l'état réel
 * de la base, et non de la liste des personnes créées par un run précédent. Un
 * import interrompu (réseau, Redis, Ctrl-C) se rattrape donc en relançant le
 * backfill, sans rien recréer.
 */
export async function findContractPeopleNeedingGeocode(
  contractCode: string,
  includeApproximate = false
): Promise<{ section: ContactSection; id: string }[]> {
  const tags = await prisma.contractLead.findMany({
    where: { contractCode: contractCode.trim().toUpperCase(), removedAt: null },
    select: { personType: true, personId: true },
  });

  const byType = { prospect: [] as string[], candidate: [] as string[], employee: [] as string[] };
  for (const t of tags) {
    if (t.personType === 'prospect' || t.personType === 'candidate' || t.personType === 'employee') {
      byType[t.personType].push(t.personId);
    }
  }

  // Sans coordonnées ; avec --all, on retente aussi les positions approximatives
  // (utile après que les RH ont complété des adresses de rue).
  const needs = includeApproximate
    ? { OR: [{ lat: null }, { geocodeSource: { not: 'address' } }] }
    : { lat: null };

  const [prospects, candidates, employees] = await Promise.all([
    byType.prospect.length
      ? prisma.prospectCandidate.findMany({
          where: { id: { in: byType.prospect }, isDeleted: false, ...needs },
          select: { id: true },
        })
      : Promise.resolve([]),
    byType.candidate.length
      ? prisma.candidate.findMany({
          where: { id: { in: byType.candidate }, isDeleted: false, ...needs },
          select: { id: true },
        })
      : Promise.resolve([]),
    byType.employee.length
      ? prisma.employee.findMany({
          where: { id: { in: byType.employee }, isDeleted: false, ...needs },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  return [
    ...prospects.map((p) => ({ section: 'prospect' as ContactSection, id: p.id })),
    ...candidates.map((c) => ({ section: 'candidate' as ContactSection, id: c.id })),
    ...employees.map((e) => ({ section: 'employee' as ContactSection, id: e.id })),
  ];
}

/**
 * Géocode toutes les personnes d'un contrat qui n'ont pas encore de position à
 * l'adresse exacte. Rejouable : à relancer après que les RH ont complété les
 * adresses manquantes. Renvoie le décompte par précision obtenue.
 */
export async function geocodeContractPeople(
  people: { section: ContactSection; id: string }[],
  onProgress?: (done: number, total: number) => void
): Promise<{ address: number; postal: number; city: number; unresolved: number }> {
  const tally = { address: 0, postal: 0, city: 0, unresolved: 0 };
  let done = 0;

  for (const p of people) {
    const geo = await geocodeContractPerson(p.section, p.id);
    if (geo?.source === 'address') tally.address++;
    else if (geo?.source === 'postal') tally.postal++;
    else if (geo?.source === 'city') tally.city++;
    else tally.unresolved++;

    done++;
    if (onProgress && done % 25 === 0) onProgress(done, people.length);
  }

  await invalidateContractCaches();
  return tally;
}
