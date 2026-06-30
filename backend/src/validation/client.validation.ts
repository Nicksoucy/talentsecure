import { z } from 'zod';

/**
 * Schémas de validation client — ALIGNÉS sur le modèle Prisma `clients`.
 *
 * (Remplace l'ancien schéma périmé qui décrivait `industry`/`status`/`website`/
 * `contractStartDate`… inexistants, et `companyName` à la place de `name`. Ce
 * décalage est la raison pour laquelle il n'était câblé sur aucune route.)
 */

const optStr = (max: number) => z.string().max(max).optional().nullable();

/** Création d'un client (POST /api/clients). `name`+`email` requis (NOT NULL). */
export const createClientSchema = z.object({
  name: z.string().min(1, 'Nom requis').max(200),
  email: z.string().email('Email invalide').max(255),
  companyName: optStr(200),
  phone: z.string().max(20).optional().nullable(),
  address: optStr(200),
  city: optStr(100),
  province: optStr(100),
  postalCode: optStr(20),
  notes: optStr(5000),
});

/** Mise à jour (PUT /api/clients/:id). Tous les champs optionnels + champs
 *  financiers/facturation du modèle. Les inconnus sont retirés (strip par
 *  défaut) → défense anti mass-assignment (en plus de l'allowlist controller). */
export const updateClientSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email('Email invalide').max(255).optional(),
  companyName: optStr(200),
  phone: z.string().max(20).optional().nullable(),
  address: optStr(200),
  city: optStr(100),
  province: optStr(100),
  postalCode: optStr(20),
  billingEmail: z.string().email('Email de facturation invalide').max(255).optional().nullable(),
  defaultPricePerCandidate: z.coerce.number().nonnegative().optional().nullable(),
  discountPercent: z.coerce.number().min(0).max(100).optional().nullable(),
  paymentTerms: optStr(100),
  taxNumber: optStr(50),
  notes: optStr(5000),
});

/** Inscription publique (POST /api/clients/register). */
export const registerClientSchema = z.object({
  name: z.string().min(1, 'Nom requis').max(200),
  email: z.string().email('Email invalide').max(255),
  password: z.string().min(8, 'Mot de passe trop court (8 caractères minimum)').max(200),
  companyName: optStr(200),
  phone: z.string().max(20).optional().nullable(),
});

/** Param :id (uuid). */
export const clientIdSchema = z.object({
  id: z.string().uuid('ID client invalide'),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type RegisterClientInput = z.infer<typeof registerClientSchema>;
