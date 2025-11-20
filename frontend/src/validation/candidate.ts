import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// Helper to transform empty strings to null for optional date fields
const optionalDateString = z
  .string()
  .transform(val => val === '' ? null : val)
  .nullable()
  .refine(val => val === null || dateRegex.test(val), {
    message: 'Format de date invalide (YYYY-MM-DD attendu)',
  })
  .optional();

const languageSchema = z.object({
  language: z.string().min(1, 'Le nom de langue est requis'),
  level: z.string().max(50).optional().nullable(),
});

const experienceSchema = z.object({
  companyName: z.string().min(1, 'Le nom de l\'entreprise est requis').max(150),
  position: z.string().min(1, 'Le poste est requis').max(150),
  startDate: optionalDateString,
  endDate: optionalDateString,
  description: z.string().max(2000).optional().nullable(),
});

const certificationSchema = z.object({
  name: z.string().min(1, 'Le nom de la certification est requis').max(150),
  expiryDate: optionalDateString,
});

export const candidateFormSchema = z.object({
  firstName: z.string().trim().min(2, 'Le prenom doit contenir au moins 2 caracteres').max(50),
  lastName: z.string().trim().min(2, 'Le nom doit contenir au moins 2 caracteres').max(50),
  email: z.string().email('Adresse courriel invalide').max(255).optional().nullable(),
  phone: z.string().trim().min(10, 'Le numero de telephone est trop court').max(20).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(12).optional().nullable(),
  interviewDate: optionalDateString,
  hasVehicle: z.boolean().optional().nullable(),
  hasDriverLicense: z.boolean().optional().nullable(),
  driverLicenseClass: z.string().max(20).optional().nullable(),
  driverLicenseNumber: z.string().max(50).optional().nullable(),
  canTravelKm: z.number().min(0).max(1000).optional().nullable(),
  hasBSP: z.boolean().optional().nullable(),
  bspNumber: z.string().max(50).optional().nullable(),
  bspExpiryDate: optionalDateString,
  bspStatus: z.string().max(50).optional().nullable(),
  professionalismRating: z.number().min(0).max(10).optional().nullable(),
  communicationRating: z.number().min(0).max(10).optional().nullable(),
  appearanceRating: z.number().min(0).max(10).optional().nullable(),
  motivationRating: z.number().min(0).max(10).optional().nullable(),
  experienceRating: z.number().min(0).max(10).optional().nullable(),
  globalRating: z.number().min(0).max(10).optional().nullable(),
  hrNotes: z.string().max(5000).optional().nullable(),
  strengths: z.string().max(2000).optional().nullable(),
  weaknesses: z.string().max(2000).optional().nullable(),
  languages: z.array(languageSchema).optional().nullable(),
  experiences: z.array(experienceSchema).optional().nullable(),
  certifications: z.array(certificationSchema).optional().nullable(),
  situationTest1: z.string().max(2000).optional().nullable(),
  situationTest2: z.string().max(2000).optional().nullable(),
  situationTest3: z.string().max(2000).optional().nullable(),
}).passthrough();

export type CandidateFormValues = z.infer<typeof candidateFormSchema>;
