/**
 * Questionnaire de préférences de travail et d'affectation.
 *
 * Accès public par JETON : les RH génèrent un lien pour une personne précise,
 * le lien porte un aléa non devinable et une date d'expiration. Aucune
 * authentification côté candidat — il n'a pas de compte et n'en aura jamais.
 *
 * Le tunnel GoHighLevel (`?c={{contact.id}}`, comme /ma-video) n'est PAS encore
 * branché ici : ce serait un second point d'entrée qui viendrait aussi créer les
 * réponses pour des prospects. À ajouter quand le jumelage couvrira les
 * prospects et pas seulement les candidats.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';
import { generateShareToken, getTokenExpiration } from '../utils/token';
import {
  ALL_ITEMS,
  ITEM_IDS,
  QUESTIONNAIRE_VERSION,
  SCALE_LABELS,
  SCALE_MAX,
  SCALE_MIN,
} from '../utils/questionnaireItems';
import {
  computeQuestionnaireScores,
  isComplete,
  missingItemIds,
  type RawAnswer,
} from '../utils/questionnaireScoring';

export type PersonType = 'candidate' | 'prospect';

/** Durée de vie d'un lien d'invitation. Assez long pour qu'un candidat le
 *  retrouve dans ses courriels, assez court pour qu'un lien oublié meure. */
const LINK_TTL_DAYS = 30;

/**
 * Réponse unique pour tous les liens refusés — inconnu, expiré, déjà soumis.
 * Pas d'oracle d'énumération : un jeton valide et un jeton mort doivent être
 * indiscernables de l'extérieur. Même principe que la page vidéo publique.
 */
function invalidLinkError(): ApiError {
  return new ApiError(
    404,
    "Ce lien n'est plus valide. Demandez-nous un nouveau lien pour remplir votre questionnaire.",
    'LIEN_INVALIDE'
  );
}

/** Colonnes de score, sans le détail énoncé par énoncé. */
const RESPONSE_SUMMARY_SELECT = {
  id: true,
  personType: true,
  personId: true,
  version: true,
  status: true,
  startedAt: true,
  completedAt: true,
  consentAt: true,
  prefConflictTolerance: true,
  prefPublicContact: true,
  prefMonotonyTolerance: true,
  prefAutonomy: true,
  prefOutdoorTolerance: true,
  prefPhysicalTolerance: true,
  traitDependability: true,
  traitIntegrity: true,
  traitSelfControl: true,
  traitStressTolerance: true,
  qualityFlags: true,
  careless: true,
  source: true,
  createdAt: true,
} satisfies Prisma.QuestionnaireResponseSelect;

/**
 * Crée (ou reprend) l'invitation d'une personne.
 *
 * Réutilise une invitation en cours plutôt que d'en empiler : sinon un
 * recruteur qui reclique « envoyer » invaliderait le lien déjà envoyé et le
 * candidat tomberait sur « lien invalide » au pire moment.
 */
export async function createInvitation(
  personType: PersonType,
  personId: string,
  userId: string | null
) {
  await assertPersonExists(personType, personId);

  const existing = await prisma.questionnaireResponse.findFirst({
    where: {
      personType,
      personId,
      status: 'IN_PROGRESS',
      version: QUESTIONNAIRE_VERSION,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return existing;

  return prisma.questionnaireResponse.create({
    data: {
      personType,
      personId,
      version: QUESTIONNAIRE_VERSION,
      accessToken: generateShareToken(),
      expiresAt: getTokenExpiration(LINK_TTL_DAYS),
      source: 'invitation',
      createdById: userId,
    },
  });
}

/** Vérifie que la personne visée existe vraiment et est joignable. */
async function assertPersonExists(personType: PersonType, personId: string) {
  const found =
    personType === 'candidate'
      ? await prisma.candidate.findFirst({
          where: { id: personId, isDeleted: false },
          select: { id: true },
        })
      : await prisma.prospectCandidate.findFirst({
          where: { id: personId, isDeleted: false },
          select: { id: true },
        });
  if (!found) throw new ApiError(404, 'Personne introuvable', 'PERSONNE_INTROUVABLE');
}

/** Prénom affiché sur la page publique — rien d'autre ne doit fuiter. */
async function firstNameOf(personType: PersonType, personId: string): Promise<string> {
  const person =
    personType === 'candidate'
      ? await prisma.candidate.findUnique({ where: { id: personId }, select: { firstName: true } })
      : await prisma.prospectCandidate.findUnique({
          where: { id: personId },
          select: { firstName: true },
        });
  return person?.firstName ?? '';
}

/** Résout un jeton en réponse ouverte, ou lève l'erreur générique. */
async function resolveOpenResponse(token: string) {
  const response = await prisma.questionnaireResponse.findUnique({
    where: { accessToken: token },
    include: { answers: { select: { itemId: true, value: true } } },
  });

  if (!response) throw invalidLinkError();
  if (response.status === 'COMPLETED') throw invalidLinkError();
  if (response.expiresAt.getTime() < Date.now()) throw invalidLinkError();
  // Le questionnaire a changé depuis l'envoi du lien : les réponses déjà données
  // ne correspondent plus aux énoncés affichés. Mieux vaut un lien mort qu'un
  // mélange silencieux de deux versions.
  if (response.version !== QUESTIONNAIRE_VERSION) throw invalidLinkError();

  return response;
}

/**
 * Session publique. La charge utile est volontairement minimale : prénom,
 * énoncés, réponses déjà données. Chaque champ renvoyé est une fuite
 * potentielle — ce lien circule par courriel et par SMS.
 */
export async function getPublicSession(token: string) {
  const response = await resolveOpenResponse(token);

  return {
    firstName: await firstNameOf(response.personType as PersonType, response.personId),
    version: response.version,
    scaleLabels: SCALE_LABELS,
    consentGiven: response.consentAt !== null,
    items: ALL_ITEMS.map((i) => ({
      id: i.id,
      text: i.text,
      block: i.block,
      dimension: i.dimension,
    })),
    answers: response.answers,
  };
}

/**
 * Enregistre des réponses partielles (sauvegarde automatique).
 *
 * Idempotent grâce à la contrainte unique (responseId, itemId) : un candidat qui
 * revient en arrière et change d'idée écrase sa réponse au lieu d'en empiler une
 * seconde. Les énoncés inconnus sont ignorés en silence plutôt que de faire
 * échouer toute la sauvegarde — perdre 20 réponses parce qu'une est douteuse
 * serait le pire compromis.
 */
export async function saveAnswers(token: string, answers: RawAnswer[]) {
  const response = await resolveOpenResponse(token);

  const valid = answers.filter(
    (a) => ITEM_IDS.has(a.itemId) && a.value >= SCALE_MIN && a.value <= SCALE_MAX
  );

  await prisma.$transaction([
    ...(response.startedAt
      ? []
      : [
          prisma.questionnaireResponse.update({
            where: { id: response.id },
            data: { startedAt: new Date() },
          }),
        ]),
    ...valid.map((a) =>
      prisma.questionnaireAnswer.upsert({
        where: { responseId_itemId: { responseId: response.id, itemId: a.itemId } },
        update: { value: a.value, elapsedMs: a.elapsedMs ?? null, answeredAt: new Date() },
        create: {
          responseId: response.id,
          itemId: a.itemId,
          value: a.value,
          elapsedMs: a.elapsedMs ?? null,
        },
      })
    ),
  ]);

  return { saved: valid.length, ignored: answers.length - valid.length };
}

/**
 * Soumission finale : calcule les scores et ferme la réponse.
 *
 * Le consentement est exigé ici et non à l'ouverture : l'art. 14 de la Loi sur
 * le privé demande qu'il soit présenté distinctement, et le donner en pleine
 * connaissance suppose d'avoir vu les questions.
 */
export async function submitQuestionnaire(token: string, consent: boolean) {
  const response = await resolveOpenResponse(token);

  if (!consent) {
    throw new ApiError(
      400,
      'Le consentement est nécessaire pour enregistrer vos réponses.',
      'CONSENTEMENT_REQUIS'
    );
  }

  const stored = await prisma.questionnaireAnswer.findMany({
    where: { responseId: response.id },
    select: { itemId: true, value: true, elapsedMs: true },
  });

  if (!isComplete(stored)) {
    throw new ApiError(
      400,
      'Certaines questions sont sans réponse.',
      'QUESTIONNAIRE_INCOMPLET',
      missingItemIds(stored).map((itemId) => ({ field: itemId, message: 'Réponse manquante' }))
    );
  }

  const { preferences, traits, quality } = computeQuestionnaireScores(stored);

  await prisma.questionnaireResponse.update({
    where: { id: response.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      consentAt: new Date(),
      prefConflictTolerance: preferences.conflictTolerance,
      prefPublicContact: preferences.publicContactPref,
      prefMonotonyTolerance: preferences.monotonyTolerance,
      prefAutonomy: preferences.autonomyPref,
      prefOutdoorTolerance: preferences.outdoorTolerance,
      prefPhysicalTolerance: preferences.physicalTolerance,
      traitDependability: traits.dependability,
      traitIntegrity: traits.integrity,
      traitSelfControl: traits.selfControl,
      traitStressTolerance: traits.stressTolerance,
      qualityFlags: quality.flags,
      careless: quality.careless,
    },
  });

  // Le candidat n'a pas à connaître son score : ce n'est pas un test qu'on
  // réussit ou qu'on rate, et le lui montrer inviterait à le refaire pour
  // « mieux » répondre.
  return { completed: true };
}

/** Dernière réponse complétée d'une personne — ce que lit le jumelage. */
export async function getLatestCompletedFor(personType: PersonType, personId: string) {
  return prisma.questionnaireResponse.findFirst({
    where: { personType, personId, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    select: RESPONSE_SUMMARY_SELECT,
  });
}

/** Idem, pour plusieurs personnes d'un coup (jumelage sur une liste). */
export async function getLatestCompletedForMany(personType: PersonType, personIds: string[]) {
  if (personIds.length === 0) return new Map<string, QuestionnaireSummary>();

  const rows = await prisma.questionnaireResponse.findMany({
    where: { personType, personId: { in: personIds }, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    select: RESPONSE_SUMMARY_SELECT,
  });

  // Trié du plus récent au plus ancien : le premier vu par personne gagne.
  const latest = new Map<string, QuestionnaireSummary>();
  for (const row of rows) {
    if (!latest.has(row.personId)) latest.set(row.personId, row);
  }
  return latest;
}

export type QuestionnaireSummary = Prisma.QuestionnaireResponseGetPayload<{
  select: typeof RESPONSE_SUMMARY_SELECT;
}>;

/**
 * Détail complet, énoncé par énoncé. Réservé : la CDPDJ recommande que les
 * réponses individuelles ne soient connues que de la personne qui administre le
 * test, les décideurs n'ayant accès qu'aux conclusions. La garde de rôle est
 * posée sur la route.
 */
export async function getResponseWithAnswers(id: string) {
  const response = await prisma.questionnaireResponse.findUnique({
    where: { id },
    include: { answers: { select: { itemId: true, value: true, elapsedMs: true } } },
  });
  if (!response) throw new ApiError(404, 'Réponse introuvable', 'REPONSE_INTROUVABLE');

  const byId = new Map(response.answers.map((a) => [a.itemId, a]));
  return {
    ...response,
    detail: ALL_ITEMS.map((item) => ({
      ...item,
      value: byId.get(item.id)?.value ?? null,
      elapsedMs: byId.get(item.id)?.elapsedMs ?? null,
    })),
  };
}
