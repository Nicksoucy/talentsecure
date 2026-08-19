/**
 * Mandats : lecture, profil saisi par la répartition, et jumelage des candidats.
 *
 * L'import Agendrix reste la source de vérité pour l'identité et l'adresse
 * (`utils/mandateImport.ts` → `computeMandateUpdate`) ; ce service ne touche
 * qu'aux colonnes de profil, que l'import ne connaît pas. Les deux chemins
 * d'écriture ne se marchent donc jamais dessus.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';
import {
  matchCandidateToMandate,
  compareMatches,
  summarizeBlockers,
  normalizeLanguageCode,
  MandateMatch,
} from '../utils/mandateMatch';
import { getLatestCompletedForMany } from './questionnaire.service';
import {
  computeFrictions,
  type Friction,
  type MandateContext,
} from '../utils/questionnaireScoring';
import type { MandateFilters, UpdateMandateProfileInput } from '../validation/mandate.validation';

/** Colonnes du profil renvoyées par la liste et le détail. */
const MANDATE_SELECT = {
  id: true,
  externalId: true,
  name: true,
  address: true,
  city: true,
  province: true,
  postalCode: true,
  lat: true,
  lng: true,
  geocodeSource: true,
  requiresBSP: true,
  requiresDriverLicense: true,
  requiresVehicle: true,
  requiredLanguages: true,
  shiftDays: true,
  shiftEvenings: true,
  shiftNights: true,
  shiftWeekends: true,
  siteType: true,
  conflictFrequency: true,
  publicContact: true,
  monotony: true,
  autonomy: true,
  outdoorExposure: true,
  physicalDemand: true,
  clientName: true,
  headcount: true,
  notes: true,
  isActive: true,
  profileUpdatedAt: true,
  createdAt: true,
} satisfies Prisma.MandateSelect;

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_MATCH_LIMIT = 50;

/**
 * Tri de la liste des mandats, champ par champ. Voir le commentaire dans
 * `listMandates` : surtout ne pas revenir à une clé calculée.
 */
function mandateOrderBy(
  sortBy: string,
  sortOrder: 'asc' | 'desc'
): Prisma.MandateOrderByWithRelationInput {
  switch (sortBy) {
    case 'city':
      return { city: sortOrder };
    case 'createdAt':
      return { createdAt: sortOrder };
    case 'name':
    default:
      return { name: sortOrder };
  }
}

export async function listMandates(filters: MandateFilters) {
  const where: Prisma.MandateWhereInput = { isDeleted: false };

  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.siteType) where.siteType = filters.siteType;
  // « Jamais coté » = l'écran de répartition n'y a jamais touché. C'est le filtre
  // qui permet d'attaquer les 146 sites sans se demander où on en était.
  if (filters.unratedOnly) where.profileUpdatedAt = null;

  if (filters.city) where.city = { contains: filters.city, mode: 'insensitive' };

  if (filters.search?.trim()) {
    // Pas de colonne `searchText` sur les mandats (elle n'existe que pour les
    // personnes) : recherche directe sur les quelques champs pertinents.
    const q = filters.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { externalId: { contains: q, mode: 'insensitive' } },
      { address: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } },
      { clientName: { contains: q, mode: 'insensitive' } },
    ];
  }

  const page = filters.page ?? 1;
  const limit = filters.limit ?? DEFAULT_PAGE_SIZE;
  const sortBy = filters.sortBy ?? 'name';
  const sortOrder = filters.sortOrder ?? 'asc';

  // `profileUpdatedAt` est nullable : sans `nulls: 'last'`, les mandats non
  // cotés monopoliseraient la première page en tri décroissant (même piège que
  // `globalRating` côté candidats).
  //
  // Les autres champs sont énumérés un à un plutôt que construits en
  // `{ [sortBy]: sortOrder }` : `sortBy` vient de la requête, et un nom de
  // propriété calculé depuis une valeur du client laisse écrire n'importe
  // quelle clé. La route pose bien une garde zod, mais elle ne protège pas les
  // autres appelants de ce service.
  const orderBy: Prisma.MandateOrderByWithRelationInput =
    sortBy === 'profileUpdatedAt'
      ? { profileUpdatedAt: { sort: sortOrder, nulls: 'last' } }
      : mandateOrderBy(sortBy, sortOrder);

  const [mandates, total] = await Promise.all([
    prisma.mandate.findMany({
      where,
      select: MANDATE_SELECT,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.mandate.count({ where }),
  ]);

  return { mandates, total, page, limit };
}

export async function getMandateById(id: string) {
  const mandate = await prisma.mandate.findFirst({
    where: { id, isDeleted: false },
    select: MANDATE_SELECT,
  });
  if (!mandate) throw new ApiError(404, 'Mandat introuvable', 'MANDAT_INTROUVABLE');
  return mandate;
}

/**
 * Met à jour le profil. Un champ absent du corps n'est pas touché ; un champ à
 * `null` remet la cote à « non coté ».
 */
export async function updateMandateProfile(
  id: string,
  input: UpdateMandateProfileInput,
  userId: string | null
) {
  const existing = await prisma.mandate.findFirst({ where: { id, isDeleted: false }, select: { id: true } });
  if (!existing) throw new ApiError(404, 'Mandat introuvable', 'MANDAT_INTROUVABLE');

  const data: Prisma.MandateUpdateInput = { ...input };

  // Normalisation à l'écriture : le jumelage compare des codes courts, et on ne
  // veut pas que « Anglais » et « EN » vivent côte à côte en base.
  if (input.requiredLanguages) {
    data.requiredLanguages = [
      ...new Set(input.requiredLanguages.map(normalizeLanguageCode).filter(Boolean)),
    ];
  }

  data.profileUpdatedAt = new Date();
  data.profileUpdatedById = userId;

  return prisma.mandate.update({ where: { id }, data, select: MANDATE_SELECT });
}

/** Candidats réellement joignables : ni supprimés, ni archivés, ni désactivés. */
const CANDIDATE_MATCH_WHERE: Prisma.CandidateWhereInput = {
  isDeleted: false,
  isArchived: false,
  isActive: true,
};

export interface MandateCandidateResult extends MandateMatch {
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  city: string;
  globalRating: number | null;
  status: string;
  /**
   * Écarts entre ce que le site exige et ce que la personne dit tolérer.
   * Informatif : ces écarts n'excluent JAMAIS (voir questionnaireScoring.ts).
   * Liste vide = aucun écart OU pas de questionnaire OU site non coté —
   * `hasQuestionnaire` permet de distinguer les trois.
   */
  frictions: Friction[];
  hasQuestionnaire: boolean;
}

/**
 * Classe les candidats pour un mandat.
 *
 * Tout le calcul se fait en mémoire : la base compte quelques centaines de
 * candidats actifs, donc un pré-filtre bounding-box coûterait plus en complexité
 * qu'il ne rapporterait — et il exclurait à tort les candidats non géocodés. Si
 * la base atteint plusieurs dizaines de milliers de fiches, ajouter le
 * pré-filtre de `utils/geo.ts` autour du site (en gardant une branche pour les
 * fiches sans coordonnées).
 */
export async function findCandidatesForMandate(
  mandateId: string,
  opts: { limit?: number; includeIneligible?: boolean } = {}
) {
  const mandate = await getMandateById(mandateId);

  const candidates = await prisma.candidate.findMany({
    where: CANDIDATE_MATCH_WHERE,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      city: true,
      status: true,
      globalRating: true,
      hasBSP: true,
      bspExpiryDate: true,
      hasDriverLicense: true,
      hasVehicle: true,
      available24_7: true,
      availableDays: true,
      availableEvenings: true,
      availableNights: true,
      availableWeekends: true,
      canTravelKm: true,
      lat: true,
      lng: true,
      languages: { select: { language: true, level: true } },
    },
  });

  const requirements = {
    requiresBSP: mandate.requiresBSP,
    requiresDriverLicense: mandate.requiresDriverLicense,
    requiresVehicle: mandate.requiresVehicle,
    requiredLanguages: mandate.requiredLanguages,
    shiftDays: mandate.shiftDays,
    shiftEvenings: mandate.shiftEvenings,
    shiftNights: mandate.shiftNights,
    shiftWeekends: mandate.shiftWeekends,
    lat: mandate.lat,
    lng: mandate.lng,
  };

  const now = new Date();
  const evaluated = candidates.map((c) => ({
    candidate: c,
    match: matchCandidateToMandate(
      { ...c, languages: c.languages.map((l) => ({ language: l.language, level: l.level })) },
      requirements,
      now
    ),
  }));

  // Le décompte des exclusions porte sur TOUS les candidats évalués — c'est ce
  // qui rend une liste courte compréhensible plutôt que suspecte.
  const excludedBy = summarizeBlockers(evaluated.map((e) => e.match));
  const eligibleCount = evaluated.filter((e) => e.match.eligible).length;

  const kept = opts.includeIneligible ? evaluated : evaluated.filter((e) => e.match.eligible);

  const page = kept
    .sort((a, b) => {
      // Avec includeIneligible, les proposables passent devant : mélanger les
      // deux par distance seule enterrerait les candidats réellement utiles.
      if (a.match.eligible !== b.match.eligible) return a.match.eligible ? -1 : 1;
      return compareMatches(a.match, b.match);
    })
    .slice(0, opts.limit ?? DEFAULT_MATCH_LIMIT);

  // Questionnaires chargés APRÈS la coupe : inutile d'aller les chercher pour
  // des centaines de candidats dont on n'affichera qu'une cinquantaine.
  // Le classement ne dépend pas d'eux — ils informent, ils ne trient pas.
  const questionnaires = await getLatestCompletedForMany(
    'candidate',
    page.map((e) => e.candidate.id)
  );

  const context: MandateContext = {
    conflictFrequency: mandate.conflictFrequency,
    publicContact: mandate.publicContact,
    monotony: mandate.monotony,
    autonomy: mandate.autonomy,
    outdoorExposure: mandate.outdoorExposure,
    physicalDemand: mandate.physicalDemand,
  };

  const results: MandateCandidateResult[] = page.map(({ candidate, match }) => {
    const q = questionnaires.get(candidate.id);
    return {
      ...match,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      phone: candidate.phone,
      email: candidate.email,
      city: candidate.city,
      globalRating: candidate.globalRating,
      status: candidate.status,
      hasQuestionnaire: Boolean(q),
      frictions: q
        ? computeFrictions(context, {
            conflictTolerance: q.prefConflictTolerance,
            publicContactPref: q.prefPublicContact,
            monotonyTolerance: q.prefMonotonyTolerance,
            autonomyPref: q.prefAutonomy,
            outdoorTolerance: q.prefOutdoorTolerance,
            physicalTolerance: q.prefPhysicalTolerance,
          })
        : [],
    };
  });

  return {
    mandate,
    candidates: results,
    meta: {
      evaluated: evaluated.length,
      eligible: eligibleCount,
      returned: results.length,
      excludedBy,
    },
  };
}
