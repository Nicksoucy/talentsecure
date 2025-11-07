import { z } from 'zod';

/**
 * Validation schema for user registration
 */
export const registerSchema = z.object({
  email: z.string()
    .email('Email invalide')
    .min(3, 'L\'email doit contenir au moins 3 caractères')
    .max(255, 'L\'email ne peut pas dépasser 255 caractères'),

  password: z.string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .max(100, 'Le mot de passe ne peut pas dépasser 100 caractères')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre'),

  firstName: z.string()
    .min(2, 'Le prénom doit contenir au moins 2 caractères')
    .max(50, 'Le prénom ne peut pas dépasser 50 caractères')
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Le prénom contient des caractères invalides'),

  lastName: z.string()
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .max(50, 'Le nom ne peut pas dépasser 50 caractères')
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Le nom contient des caractères invalides'),

  role: z.enum(['ADMIN', 'RH_RECRUITER', 'SALES'], {
    errorMap: () => ({ message: 'Rôle invalide. Valeurs acceptées: ADMIN, RH_RECRUITER, SALES' }),
  }),
});

/**
 * Validation schema for user login
 */
export const loginSchema = z.object({
  email: z.string()
    .email('Email invalide')
    .min(3, 'L\'email doit contenir au moins 3 caractères'),

  password: z.string()
    .min(1, 'Le mot de passe est requis'),
});

/**
 * Type exports for TypeScript
 */
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
