/**
 * Leads de contrat — rattachement d'une personne (prospect / candidat / employé)
 * à un contrat client (ex. « PSB »).
 *
 * C'est le seul mécanisme de tag de la base. Il est volontairement SANS FK vers
 * les tables de personnes : taguer quelqu'un n'écrit jamais dans sa fiche, et
 * supprimer la table `contract_leads` n'a aucun effet sur les personnes.
 *
 * Toutes les fonctions de LECTURE utilisées par des chemins chauds (listes de
 * prospects) dégradent en silence plutôt que de propager une erreur : un souci
 * ici ne doit jamais casser une page.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import logger from '../config/logger';
import { invalidateCacheByPrefix } from '../config/cache';
import { ContactSection } from '../utils/candidateMatch';
import { lastTenDigits } from '../utils/phone';

/** Préfixe des clés de cache de ce module (points carte par contrat). */
export const CONTRACT_CACHE_PREFIX = 'contracts:';

export const contractMapPointsCacheKey = (code: string) => `${CONTRACT_CACHE_PREFIX}${code}:map-points`;

/**
 * Purge tout le cache des contrats. Appelée par l'import et le géocodage
 * uniquement — délibérément PAS branchée dans les invalidations
 * prospect/candidat/employé, pour ne pas alourdir trois chemins chauds au prix
 * de 300 s de fraîcheur que personne ne remarque.
 */
export const invalidateContractCaches = () => invalidateCacheByPrefix(CONTRACT_CACHE_PREFIX);

/** Code de contrat normalisé (MAJUSCULES, sans espaces superflus). */
export const normalizeContractCode = (raw: string) => raw.trim().toUpperCase();

export interface TagPersonInput {
  contractCode: string;
  personType: ContactSection;
  personId: string;
  sourceCvFile?: string | null;
  email?: string | null;
  phone?: string | null;
  note?: string | null;
}

/**
 * Tague une personne pour un contrat. Idempotent : rejouer l'import ne crée pas
 * de doublon et réactive un tag précédemment retiré (removedAt → null).
 */
export async function tagPerson(input: TagPersonInput): Promise<{ created: boolean }> {
  const contractCode = normalizeContractCode(input.contractCode);
  const where = {
    contractCode_personType_personId: {
      contractCode,
      personType: input.personType,
      personId: input.personId,
    },
  };

  const existing = await prisma.contractLead.findUnique({ where });
  const data = {
    sourceCvFile: input.sourceCvFile ?? null,
    matchEmail: input.email ? input.email.trim().toLowerCase() : null,
    matchPhoneDigits: lastTenDigits(input.phone) || null,
    note: input.note ?? null,
  };

  await prisma.contractLead.upsert({
    where,
    create: {
      contractCode,
      personType: input.personType,
      personId: input.personId,
      ...data,
    },
    // Un tag retiré puis réimporté redevient actif.
    update: { ...data, removedAt: null },
  });

  return { created: !existing };
}

/** Retire un tag (réversible : on pose removedAt, on ne supprime jamais). */
export async function untagPerson(
  contractCode: string,
  personType: ContactSection,
  personId: string
): Promise<void> {
  await prisma.contractLead.updateMany({
    where: { contractCode: normalizeContractCode(contractCode), personType, personId, removedAt: null },
    data: { removedAt: new Date() },
  });
}

export interface ContractPersonIds {
  prospect: string[];
  candidate: string[];
  employee: string[];
}

/** Ids des personnes activement taguées pour un contrat, groupés par section. */
export async function loadContractPersonIds(contractCode: string): Promise<ContractPersonIds> {
  const rows = await prisma.contractLead.findMany({
    where: { contractCode: normalizeContractCode(contractCode), removedAt: null },
    select: { personType: true, personId: true },
  });

  const out: ContractPersonIds = { prospect: [], candidate: [], employee: [] };
  for (const r of rows) {
    if (r.personType === 'prospect' || r.personType === 'candidate' || r.personType === 'employee') {
      out[r.personType].push(r.personId);
    }
  }
  return out;
}

/**
 * Recopie les tags actifs d'une personne vers sa nouvelle fiche après un
 * déplacement de section (moveContact) ou une conversion prospect → candidat.
 *
 * NE THROW JAMAIS et doit être appelée EN DEHORS de la transaction du
 * déplacement : perdre un tag est bénin (l'import est idempotent et le
 * re-pose), annuler un déplacement de personne ne l'est pas.
 */
export async function carryOverTags(
  from: { section: ContactSection; id: string },
  to: { section: ContactSection; id: string }
): Promise<void> {
  try {
    const tags = await prisma.contractLead.findMany({
      where: { personType: from.section, personId: from.id, removedAt: null },
    });
    if (tags.length === 0) return;

    for (const t of tags) {
      await prisma.contractLead.upsert({
        where: {
          contractCode_personType_personId: {
            contractCode: t.contractCode,
            personType: to.section,
            personId: to.id,
          },
        },
        create: {
          contractCode: t.contractCode,
          personType: to.section,
          personId: to.id,
          sourceCvFile: t.sourceCvFile,
          matchEmail: t.matchEmail,
          matchPhoneDigits: t.matchPhoneDigits,
          note: t.note,
        },
        update: { removedAt: null },
      });
    }

    // L'ancien tag ne pointe plus sur une fiche vivante : on le retire.
    await prisma.contractLead.updateMany({
      where: { personType: from.section, personId: from.id, removedAt: null },
      data: { removedAt: new Date() },
    });

    await invalidateContractCaches();
  } catch (e: any) {
    logger.warn(
      `[contrats] report des tags ${from.section}:${from.id} → ${to.section}:${to.id} échoué: ${e?.message}`
    );
  }
}

/**
 * Attache `contracts: string[]` à une page de personnes (1 seule requête).
 * Mute les objets passés. Dégradation silencieuse : en cas d'erreur chaque
 * personne reçoit une liste vide plutôt que de faire échouer la page.
 */
export async function attachContractCodes<T extends { id: string; contracts?: string[] }>(
  personType: ContactSection,
  rows: T[]
): Promise<T[]> {
  if (rows.length === 0) return rows;
  try {
    const tags = await prisma.contractLead.findMany({
      where: { personType, personId: { in: rows.map((r) => r.id) }, removedAt: null },
      select: { personId: true, contractCode: true },
    });

    const byPerson = new Map<string, string[]>();
    for (const t of tags) {
      const list = byPerson.get(t.personId);
      if (list) list.push(t.contractCode);
      else byPerson.set(t.personId, [t.contractCode]);
    }
    for (const r of rows) r.contracts = byPerson.get(r.id) ?? [];
  } catch (e: any) {
    logger.warn(`[contrats] enrichissement des codes contrat échoué: ${e?.message}`);
    for (const r of rows) r.contracts = [];
  }
  return rows;
}

/**
 * Fusionne une liste d'ids dans un `where` Prisma en INTERSECTANT avec un
 * éventuel filtre d'ids déjà présent (ex. résultat de recherche) — écraser
 * `where.id` ferait silencieusement disparaître l'autre critère.
 */
export function mergeIdFilter(where: Prisma.ProspectCandidateWhereInput, ids: string[]): void {
  const existing = where.id;
  if (existing && typeof existing === 'object' && 'in' in existing && Array.isArray(existing.in)) {
    const keep = new Set(ids);
    where.id = { in: (existing.in as string[]).filter((id) => keep.has(id)) };
    return;
  }
  where.id = { in: ids };
}

/** Ids prospects actifs d'un contrat — pour le filtre `?contractCode=` des listes. */
export async function prospectIdsForContract(contractCode: string): Promise<string[]> {
  const rows = await prisma.contractLead.findMany({
    where: { contractCode: normalizeContractCode(contractCode), personType: 'prospect', removedAt: null },
    select: { personId: true },
  });
  return rows.map((r) => r.personId);
}

/** Récapitulatif par contrat, pour alimenter le filtre du frontend. */
export async function listContractSummaries(): Promise<
  { code: string; total: number; byType: Record<string, number> }[]
> {
  const rows = await prisma.contractLead.groupBy({
    by: ['contractCode', 'personType'],
    where: { removedAt: null },
    _count: { _all: true },
  });

  const byCode = new Map<string, { code: string; total: number; byType: Record<string, number> }>();
  for (const r of rows) {
    let entry = byCode.get(r.contractCode);
    if (!entry) {
      entry = { code: r.contractCode, total: 0, byType: {} };
      byCode.set(r.contractCode, entry);
    }
    const n = r._count._all;
    entry.total += n;
    entry.byType[r.personType] = (entry.byType[r.personType] ?? 0) + n;
  }

  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
}
