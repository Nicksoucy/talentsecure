import { z } from 'zod';
import { SCALE_MAX, SCALE_MIN } from '../utils/questionnaireItems';

/**
 * Validation du questionnaire.
 *
 * Schémas `.strict()` : routes neuves, rien à préserver, et la route publique
 * est exposée sans authentification — tout champ non prévu doit être refusé
 * plutôt que traversé.
 */

/**
 * Jeton d'accès public. Alphabet borné volontairement : `generateShareToken`
 * produit du base64url, et une borne stricte évite qu'une valeur exotique se
 * promène jusque dans une requête.
 */
export const questionnaireTokenSchema = z
  .string()
  .trim()
  .min(20)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'Jeton invalide');

export const questionnaireSessionQuerySchema = z
  .object({ token: questionnaireTokenSchema })
  .strict();

/**
 * Une réponse. `elapsedMs` est plafonné : un onglet laissé ouvert toute la nuit
 * produirait des millions de ms et fausserait la médiane du contrôle qualité.
 */
const answerSchema = z
  .object({
    itemId: z.string().trim().min(1).max(64),
    value: z.coerce.number().int().min(SCALE_MIN).max(SCALE_MAX),
    elapsedMs: z.coerce.number().int().min(0).max(600_000).optional(),
  })
  .strict();

export const saveAnswersSchema = z
  .object({
    token: questionnaireTokenSchema,
    // Borne haute large : la banque compte 26 énoncés, mais un client qui
    // renvoie tout à chaque sauvegarde reste légitime.
    answers: z.array(answerSchema).min(1).max(200),
  })
  .strict();

export const submitQuestionnaireSchema = z
  .object({
    token: questionnaireTokenSchema,
    /**
     * Consentement Loi 25 (art. 14) : exigé explicitement, jamais présumé.
     * `z.literal(true)` plutôt qu'un booléen — `false` doit être un refus
     * lisible côté serveur, pas une valeur acceptée en silence.
     */
    consent: z.literal(true),
  })
  .strict();

// ─────────────────────────────── Côté personnel ──────────────────────────────

export const personTypeSchema = z.enum(['candidate', 'prospect']);

export const createInvitationSchema = z
  .object({
    personType: personTypeSchema,
    personId: z.string().uuid(),
  })
  .strict();

export const personParamsSchema = z
  .object({
    personType: personTypeSchema,
    personId: z.string().uuid(),
  })
  .strict();

export const responseIdParamSchema = z.object({ id: z.string().uuid() }).strict();
