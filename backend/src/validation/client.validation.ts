import { z } from 'zod';

/**
 * Validation schema for creating a client
 */
export const createClientSchema = z.object({
  companyName: z.string()
    .min(2, 'Le nom de l\'entreprise doit contenir au moins 2 caractères')
    .max(100, 'Le nom de l\'entreprise ne peut pas dépasser 100 caractères'),

  contactName: z.string()
    .min(2, 'Le nom du contact doit contenir au moins 2 caractères')
    .max(100, 'Le nom du contact ne peut pas dépasser 100 caractères')
    .optional()
    .nullable(),

  email: z.string()
    .email('Email invalide')
    .max(255, 'L\'email ne peut pas dépasser 255 caractères')
    .optional()
    .nullable(),

  phone: z.string()
    .regex(/^[\d\s+()-]+$/, 'Numéro de téléphone invalide')
    .min(10, 'Le numéro de téléphone doit contenir au moins 10 chiffres')
    .max(20, 'Le numéro de téléphone ne peut pas dépasser 20 caractères')
    .optional()
    .nullable(),

  address: z.string()
    .max(200, 'L\'adresse ne peut pas dépasser 200 caractères')
    .optional()
    .nullable(),

  city: z.string()
    .max(100, 'La ville ne peut pas dépasser 100 caractères')
    .optional()
    .nullable(),

  postalCode: z.string()
    .regex(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, 'Code postal canadien invalide (format: A1A 1A1)')
    .optional()
    .nullable(),

  industry: z.string()
    .max(100, 'Le secteur d\'activité ne peut pas dépasser 100 caractères')
    .optional()
    .nullable(),

  status: z.enum(['ACTIVE', 'INACTIVE', 'PROSPECT'], {
    errorMap: () => ({ message: 'Statut invalide. Valeurs acceptées: ACTIVE, INACTIVE, PROSPECT' }),
  }).optional().nullable(),

  notes: z.string()
    .max(5000, 'Les notes ne peuvent pas dépasser 5000 caractères')
    .optional()
    .nullable(),

  website: z.string()
    .url('URL de site web invalide')
    .max(255, 'L\'URL ne peut pas dépasser 255 caractères')
    .optional()
    .nullable(),

  // Relationship fields
  accountManagerId: z.string()
    .uuid('ID gestionnaire de compte invalide')
    .optional()
    .nullable(),

  // Contract information
  contractStartDate: z.string()
    .datetime('Date de début de contrat invalide')
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format YYYY-MM-DD requise'))
    .optional()
    .nullable(),

  contractEndDate: z.string()
    .datetime('Date de fin de contrat invalide')
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format YYYY-MM-DD requise'))
    .optional()
    .nullable(),

  billingAddress: z.string()
    .max(200, 'L\'adresse de facturation ne peut pas dépasser 200 caractères')
    .optional()
    .nullable(),

  // Admin fields
  createdBy: z.string().uuid('ID utilisateur invalide').optional().nullable(),
}).strict(); // Reject unknown fields

/**
 * Validation schema for updating a client
 * All fields are optional for updates
 */
export const updateClientSchema = createClientSchema.partial();

/**
 * Validation schema for client ID param
 */
export const clientIdSchema = z.object({
  id: z.string().uuid('ID client invalide'),
});

/**
 * Validation schema for client filters
 */
export const clientFiltersSchema = z.object({
  search: z.string().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PROSPECT']).optional(),
  city: z.string().max(100).optional(),
  industry: z.string().max(100).optional(),
  accountManagerId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
}).strict();

/**
 * Type exports for TypeScript
 */
export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ClientFilters = z.infer<typeof clientFiltersSchema>;
