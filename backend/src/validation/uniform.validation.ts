import { z } from 'zod';

/**
 * Validation des mutations STOCK / ARGENT du module uniformes.
 *
 * Principe : NON-BLOQUANT par construction.
 *  - `.passthrough()` conserve les champs non listés (pas de strip → on ne
 *    casse aucun payload existant).
 *  - `z.coerce.number()` tolère les nombres envoyés en chaîne ("5" → 5), ce qui
 *    évite que des opérations arithmétiques de stock reçoivent une string.
 *  - Les bornes (positive / ≥ 0) reflètent EXACTEMENT les gardes inline déjà
 *    présentes dans les controllers (replenish/adjust/transfer/settlement), qui
 *    sont CONSERVÉES en défense en profondeur. Le seul changement de
 *    comportement est une réponse 400 d'enveloppe cohérente (ERREUR_VALIDATION)
 *    au lieu d'un throw ad hoc, plus la coercion numérique.
 *
 * Périmètre : mutations scalaires de stock/argent. Les corps imbriqués
 * (issuances avec `lines[]`, returns, wash-batches, items) restent à couvrir
 * dans un suivi vérifié par la suite d'intégration en CI.
 */

export const replenishVariantSchema = z
  .object({
    quantity: z.coerce.number().int().positive('Quantité positive requise'),
    reason: z.string().max(500).optional(),
    location: z.string().optional(),
  })
  .passthrough();

export const adjustVariantSchema = z
  .object({
    // setTo OU quantity (le controller gère l'un ou l'autre) → tous deux optionnels.
    quantity: z.coerce.number().int().optional(),
    setTo: z.coerce.number().int().min(0, 'setTo doit être un entier ≥ 0').optional(),
    reason: z.string().max(500).optional(),
    location: z.string().optional(),
  })
  .passthrough();

export const transferVariantSchema = z
  .object({
    quantity: z.coerce.number().int().positive('Quantité positive requise'),
    from: z.string().min(1, 'Emplacement source requis'),
    to: z.string().min(1, 'Emplacement cible requis'),
    reason: z.string().max(500).optional(),
  })
  .passthrough();

export const createSettlementSchema = z
  .object({
    amount: z.coerce.number().positive('Montant positif requis'),
    method: z.string().max(50).optional(),
    notes: z.string().max(2000).optional(),
  })
  .passthrough();

/** Création d'une remise (POST /issuances). Reflète EXACTEMENT les gardes inline
 *  du controller : employeeId + division requis, sourceLocation ∈ {BACK_OFFICE,
 *  FRONT_OFFICE}. Le reste (dueReturnAt/notes/champs de ligne) reste passthrough
 *  → aucun payload valide ne casse, seules les mêmes entrées invalides sont
 *  rejetées (mais via une enveloppe 400 cohérente). */
export const createIssuanceSchema = z
  .object({
    employeeId: z.string().min(1, 'employeeId requis'),
    division: z.string().min(1, 'division requise'),
    sourceLocation: z.enum(['BACK_OFFICE', 'FRONT_OFFICE']).optional(),
    lines: z
      .array(
        z
          .object({
            variantId: z.string().optional().nullable(),
            quantity: z.coerce.number().int().optional(),
            unitCost: z.coerce.number().optional().nullable(),
            sourceLocation: z.string().optional().nullable(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

/** Création d'un retour (POST /returns). Garde du controller : issuanceId requis. */
export const createReturnSchema = z
  .object({
    issuanceId: z.string().min(1, 'issuanceId requis'),
    lines: z.array(z.object({}).passthrough()).optional(),
  })
  .passthrough();
