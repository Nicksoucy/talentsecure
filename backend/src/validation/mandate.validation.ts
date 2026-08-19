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
export type UpdateMandateProfileInput = z.infer<typeof updateMandateProfileSchema>;
