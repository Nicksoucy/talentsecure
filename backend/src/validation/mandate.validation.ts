import { z } from 'zod';

/**
 * Validation des mandats.
 *
 * Schémas `.strict()` (et non `.passthrough()` comme employé/prospect) : ces
 * routes sont neuves, donc rien à préserver pour la compatibilité, et le profil
 * est saisi depuis un écran d'administration — refuser un champ inconnu est ici
 * la bonne réponse, pas une régression. Ça ferme aussi l'affectation de masse
 * (personne ne doit pouvoir pousser `externalId` ou `lat` par ce chemin).
 *
 * Rappel : un champ non fourni n'est PAS modifié ; un champ fourni à `null`
 * remet la cote à « non coté ». La distinction compte — 1 (faible) et « pas
 * encore évalué » ne veulent pas dire la même chose.
 */

/** Types de site, alignés sur le vocabulaire des répartiteurs. */
export const SITE_TYPES = [
  'STATIQUE',
  'MOBILE',
  'CHANTIER',
  'EVENEMENTIEL',
  'RESIDENTIEL',
  'INDUSTRIEL',
  'INSTITUTIONNEL',
] as const;

/** Cotes de contexte de travail : 1 (faible) à 5 (élevé), null = non coté. */
const rating = z.coerce.number().int().min(1).max(5).nullable().optional();

/**
 * Booléen de query string.
 *
 * SURTOUT PAS `z.coerce.boolean()` : la coercition applique `Boolean(valeur)`,
 * et `Boolean('false') === true`. Un filtre explicitement désactivé serait donc
 * lu comme activé. Même patron que `candidate.validation.ts`, où ce bogue avait
 * déjà été corrigé.
 */
const queryBoolean = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

export const mandateFiltersSchema = z
  .object({
    search: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    siteType: z.enum(SITE_TYPES).optional(),
    isActive: queryBoolean,
    /** Ne renvoyer que les mandats dont le profil n'a jamais été rempli. */
    unratedOnly: queryBoolean,
    /** Afficher les mandats retirés (et seulement eux) pour pouvoir les ramener. */
    removed: queryBoolean,
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    sortBy: z.enum(['name', 'city', 'profileUpdatedAt', 'createdAt']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
  .strict();

export const updateMandateProfileSchema = z
  .object({
    requiresBSP: z.boolean().optional(),
    requiresDriverLicense: z.boolean().optional(),
    requiresVehicle: z.boolean().optional(),
    // Normalisées côté service : le formulaire peut envoyer « Anglais » comme « EN ».
    requiredLanguages: z.array(z.string().max(30)).max(10).optional(),

    shiftDays: z.boolean().optional(),
    shiftEvenings: z.boolean().optional(),
    shiftNights: z.boolean().optional(),
    shiftWeekends: z.boolean().optional(),

    siteType: z.enum(SITE_TYPES).nullable().optional(),
    conflictFrequency: rating,
    publicContact: rating,
    monotony: rating,
    autonomy: rating,
    outdoorExposure: rating,
    physicalDemand: rating,

    clientName: z.string().max(200).nullable().optional(),
    headcount: z.coerce.number().int().min(0).max(9999).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

/** Texte facultatif : une chaîne vide vaut « non fourni ». */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/**
 * Ajout manuel d'un mandat (hors import Agendrix). Seules l'identité et
 * l'adresse passent ici ; le profil se saisit ensuite par le PATCH habituel.
 * `lat`/`lng` restent interdits : c'est le géocodage qui les pose.
 */
export const createMandateSchema = z
  .object({
    name: z.string().trim().min(1, 'Le nom du site est requis').max(200),
    // Identifiant Agendrix s'il existe déjà ; sinon le service en génère un (MAN-0001).
    externalId: optionalText(50),
    address: optionalText(300),
    city: optionalText(100),
    postalCode: optionalText(10),
    province: optionalText(2),
    clientName: optionalText(200),
  })
  .strict();

/** Actions sans charge utile (ramener un mandat) : tout champ envoyé est refusé. */
export const emptyBodySchema = z.object({}).strict();

export const mandateIdParamSchema = z.object({ id: z.string().uuid() }).strict();

export const mandateCandidatesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    /**
     * Renvoyer aussi les candidats écartés, avec leurs blocages. Sert au
     * diagnostic (« pourquoi Untel ne sort-il pas ? ») ; hors de ce cas, la
     * liste par défaut reste celle des candidats réellement proposables.
     */
    includeIneligible: queryBoolean,
  })
  .strict();

export type MandateFilters = z.infer<typeof mandateFiltersSchema>;
export type CreateMandateInput = z.infer<typeof createMandateSchema>;
export type UpdateMandateProfileInput = z.infer<typeof updateMandateProfileSchema>;
