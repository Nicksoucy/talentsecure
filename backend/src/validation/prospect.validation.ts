import { z } from 'zod';

/**
 * Validation prospect. NON-BLOQUANT (`.passthrough()`) : le controller lit des
 * champs nommés (create) / une allowlist de clés (update). On n'exige que les
 * colonnes NOT NULL du modèle ProspectCandidate (firstName/lastName/phone).
 */
const opt = (max: number) => z.string().max(max).optional().nullable();

export const createProspectSchema = z
  .object({
    firstName: z.string().max(100),
    lastName: z.string().max(100),
    phone: z.string().max(30),
    email: opt(255),
    address: opt(200),
    city: opt(100),
    province: opt(50),
    postalCode: opt(20),
  })
  .passthrough();

export const updateProspectSchema = z
  .object({
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional(),
    phone: z.string().max(30).optional(),
    email: opt(255),
    address: opt(200),
    city: opt(100),
    province: opt(50),
    postalCode: opt(20),
  })
  .passthrough();

/** Assignation en masse à un client (POST /bulk-assign-to-client). Miroir des
 *  gardes : prospectIds non vide + clientId requis. */
export const bulkAssignSchema = z
  .object({
    prospectIds: z.array(z.string()).min(1, 'prospectIds requis'),
    clientId: z.string().min(1, 'clientId requis'),
  })
  .passthrough();

/** Export ZIP (POST /export-zip). Garde : prospectIds non vide. */
export const exportZipSchema = z
  .object({
    prospectIds: z.array(z.string()).min(1, 'prospectIds requis'),
  })
  .passthrough();
