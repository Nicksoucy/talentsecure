import { z } from 'zod';

const phoneRegex = /^[\d\s+()-]+$/;
const postalCodeRegex = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
const dateString = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format YYYY-MM-DD requise')
  .transform((str) => new Date(str));

const dateTimeString = z.string()
  .datetime('Date invalide (format ISO 8601 requis)')
  .transform((str) => new Date(str));

const availabilitySchema = z.object({
  type: z.enum(['JOUR', 'SOIR', 'NUIT', 'FIN_DE_SEMAINE', 'JOUR_SEMAINE', 'NUIT_SEMAINE']),
  isAvailable: z.boolean().default(true),
  notes: z.string().optional().nullable(),
});

const languageSchema = z.object({
  language: z.string().max(50),
  level: z.string().max(50).optional().nullable(),
});

const experienceSchema = z.object({
  companyName: z.string().max(150),
  position: z.string().max(150),
  startDate: dateString.optional().nullable(),
  endDate: dateString.optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

const certificationSchema = z.object({
  name: z.string().max(150),
  issuer: z.string().max(150).optional().nullable(),
  expiryDate: dateString.optional().nullable(),
});

const situationTestSchema = z.object({
  question: z.string().max(255),
  answer: z.string().max(5000),
});

const baseCandidateSchema = z.object({
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().regex(phoneRegex).min(10).max(20).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  province: z.string().max(100).optional().nullable(),
  postalCode: z.string()
    .transform(val => val?.trim().replace(/\s+/g, ' ').toUpperCase())
    .pipe(z.string().regex(postalCodeRegex, 'Code postal canadien invalide'))
    .optional()
    .nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  status: z.enum([
    'AVAILABLE', 'PLACED', 'UNAVAILABLE', 'IN_PROCESS', 'EN_ATTENTE',
    'QUALIFIE', 'ELITE', 'EXCELLENT', 'TRES_BON', 'BON', 'A_REVOIR', 'INACTIF', 'NEW'
  ]).optional().nullable(),
  globalRating: z.number().min(0).max(10).optional().nullable(),
  professionalismRating: z.number().min(0).max(10).optional().nullable(),
  communicationRating: z.number().min(0).max(10).optional().nullable(),
  appearanceRating: z.number().min(0).max(10).optional().nullable(),
  motivationRating: z.number().min(0).max(10).optional().nullable(),
  experienceRating: z.number().min(0).max(10).optional().nullable(),
  hrNotes: z.string().max(5000).optional().nullable(),
  strengths: z.string().max(2000).optional().nullable(),
  weaknesses: z.string().max(2000).optional().nullable(),
  hasBSP: z.boolean().optional().nullable(),
  bspNumber: z.string().max(50).optional().nullable(),
  bspStatus: z.enum(['VALID', 'EXPIRED', 'PENDING', 'NONE']).optional().nullable(),
  bspExpiryDate: dateString.or(dateTimeString).optional().nullable(),
  bspObtainedDate: dateString.or(dateTimeString).optional().nullable(),
  hasVehicle: z.boolean().optional().nullable(),
  hasDriverLicense: z.boolean().optional().nullable(),
  driverLicenseNumber: z.string().max(50).optional().nullable(),
  driverLicenseClass: z.string().max(20).optional().nullable(),
  canWorkUrgent: z.boolean().optional().nullable(),
  hasConsent: z.boolean().optional().nullable(),
  consentDate: dateString.or(dateTimeString).optional().nullable(),
  consentSignature: z.string().max(255).optional().nullable(),
  canTravelKm: z.number().min(0).max(1000).optional().nullable(),
  availableFrom: dateString.or(dateTimeString).optional().nullable(),
  interviewDate: dateString.or(dateTimeString).optional().nullable(),
  interviewScore: z.number().min(0).max(100).optional().nullable(),
  interviewNotes: z.string().max(5000).optional().nullable(),
  urgency24hScore: z.number().min(0).max(100).optional().nullable(),
  availabilities: z.array(availabilitySchema).optional().nullable(),
  languages: z.array(languageSchema).optional().nullable(),
  experiences: z.array(experienceSchema).optional().nullable(),
  certifications: z.array(certificationSchema).optional().nullable(),
  situationTests: z.array(situationTestSchema).optional().nullable(),
  createdBy: z.string().uuid().optional().nullable(),
});

export const createCandidateSchema = baseCandidateSchema.strict();
export const updateCandidateSchema = baseCandidateSchema.partial().strict();

export const candidateIdSchema = z.object({
  id: z.string().uuid('ID candidat invalide'),
});

export const candidateFiltersSchema = z.object({
  search: z.string().max(100).optional(),
  status: z.enum([
    'AVAILABLE', 'PLACED', 'UNAVAILABLE', 'IN_PROCESS', 'EN_ATTENTE',
    'QUALIFIE', 'ELITE', 'EXCELLENT', 'TRES_BON', 'BON', 'A_REVOIR', 'INACTIF', 'NEW'
  ]).optional(),
  minRating: z.coerce.number().min(0).max(10).optional(),
  city: z.string().max(100).optional(),
  hasBSP: z.enum(['true', 'false']).transform((val) => val === 'true').optional(),
  hasVehicle: z.enum(['true', 'false']).transform((val) => val === 'true').optional(),
  hasVideo: z.enum(['true', 'false']).transform((val) => val === 'true').optional(),
  hasDriverLicense: z.enum(['true', 'false']).transform((val) => val === 'true').optional(),
  hasCV: z.enum(['true', 'false']).transform((val) => val === 'true').optional(),
  canWorkUrgent: z.enum(['true', 'false']).transform((val) => val === 'true').optional(),
  includeArchived: z.enum(['true', 'false']).transform((val) => val === 'true').optional(),
  maxTravelKm: z.coerce.number().min(0).max(1000).optional(),
  bspStatus: z.enum(['VALID', 'EXPIRED', 'PENDING', 'NONE']).optional(),
  interviewDateStart: dateString.or(dateTimeString).optional(),
  interviewDateEnd: dateString.or(dateTimeString).optional(),
  certification: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
}).strict();

export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;
export type CandidateFilters = z.infer<typeof candidateFiltersSchema>;
