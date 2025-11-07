import { z } from 'zod';

/**
 * Validation schema for creating a candidate
 */
export const createCandidateSchema = z.object({
  firstName: z.string()
    .min(2, 'Le prénom doit contenir au moins 2 caractères')
    .max(50, 'Le prénom ne peut pas dépasser 50 caractères')
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Le prénom contient des caractères invalides'),

  lastName: z.string()
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .max(50, 'Le nom ne peut pas dépasser 50 caractères')
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Le nom contient des caractères invalides'),

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

  latitude: z.number()
    .min(-90, 'Latitude invalide')
    .max(90, 'Latitude invalide')
    .optional()
    .nullable(),

  longitude: z.number()
    .min(-180, 'Longitude invalide')
    .max(180, 'Longitude invalide')
    .optional()
    .nullable(),

  status: z.enum(['AVAILABLE', 'PLACED', 'UNAVAILABLE', 'IN_PROCESS'], {
    errorMap: () => ({ message: 'Statut invalide' }),
  }).optional().nullable(),

  rating: z.number()
    .min(0, 'La note ne peut pas être négative')
    .max(5, 'La note ne peut pas dépasser 5')
    .optional()
    .nullable(),

  notes: z.string()
    .max(5000, 'Les notes ne peuvent pas dépasser 5000 caractères')
    .optional()
    .nullable(),

  // BSP-related fields
  hasBSP: z.boolean().optional().nullable(),

  bspNumber: z.string()
    .max(50, 'Le numéro BSP ne peut pas dépasser 50 caractères')
    .optional()
    .nullable(),

  bspStatus: z.enum(['VALID', 'EXPIRED', 'PENDING', 'NONE'], {
    errorMap: () => ({ message: 'Statut BSP invalide' }),
  }).optional().nullable(),

  bspExpiryDate: z.string()
    .datetime('Date d\'expiration BSP invalide')
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format YYYY-MM-DD requise'))
    .optional()
    .nullable(),

  bspObtainedDate: z.string()
    .datetime('Date d\'obtention BSP invalide')
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format YYYY-MM-DD requise'))
    .optional()
    .nullable(),

  // Work-related fields
  hasVehicle: z.boolean().optional().nullable(),
  hasDriverLicense: z.boolean().optional().nullable(),
  canWorkUrgent: z.boolean().optional().nullable(),

  maxTravelKm: z.number()
    .min(0, 'La distance maximale de déplacement ne peut pas être négative')
    .max(1000, 'La distance maximale de déplacement ne peut pas dépasser 1000 km')
    .optional()
    .nullable(),

  availableFrom: z.string()
    .datetime('Date de disponibilité invalide')
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format YYYY-MM-DD requise'))
    .optional()
    .nullable(),

  // Interview fields
  interviewDate: z.string()
    .datetime('Date d\'entretien invalide')
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format YYYY-MM-DD requise'))
    .optional()
    .nullable(),

  interviewScore: z.number()
    .min(0, 'Le score d\'entretien ne peut pas être négatif')
    .max(100, 'Le score d\'entretien ne peut pas dépasser 100')
    .optional()
    .nullable(),

  interviewNotes: z.string()
    .max(5000, 'Les notes d\'entretien ne peuvent pas dépasser 5000 caractères')
    .optional()
    .nullable(),

  // Admin fields
  createdBy: z.string().uuid('ID utilisateur invalide').optional().nullable(),
}).strict(); // Reject unknown fields

/**
 * Validation schema for updating a candidate
 * All fields are optional for updates
 */
export const updateCandidateSchema = createCandidateSchema.partial();

/**
 * Validation schema for candidate ID param
 */
export const candidateIdSchema = z.object({
  id: z.string().uuid('ID candidat invalide'),
});

/**
 * Validation schema for candidate filters
 */
export const candidateFiltersSchema = z.object({
  search: z.string().max(100).optional(),
  status: z.enum(['AVAILABLE', 'PLACED', 'UNAVAILABLE', 'IN_PROCESS']).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  city: z.string().max(100).optional(),
  hasBSP: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  hasVehicle: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  hasVideo: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  hasDriverLicense: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  hasCV: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  canWorkUrgent: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  maxTravelKm: z.coerce.number().min(0).max(1000).optional(),
  bspStatus: z.enum(['VALID', 'EXPIRED', 'PENDING', 'NONE']).optional(),
  interviewDateStart: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  interviewDateEnd: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
}).strict();

/**
 * Type exports for TypeScript
 */
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;
export type CandidateFilters = z.infer<typeof candidateFiltersSchema>;
