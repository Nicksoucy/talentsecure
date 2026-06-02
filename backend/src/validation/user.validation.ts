import { z } from 'zod';

// Réutilise les mêmes règles que registerSchema, mais l'enum de rôle inclut
// MAGASIN (registerSchema l'exclut).
const emailField = z.string()
  .email('Email invalide')
  .min(3, 'L\'email doit contenir au moins 3 caractères')
  .max(255, 'L\'email ne peut pas dépasser 255 caractères');

const passwordField = z.string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .max(100, 'Le mot de passe ne peut pas dépasser 100 caractères')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
  .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre');

const nameField = z.string()
  .min(2, 'Doit contenir au moins 2 caractères')
  .max(50, 'Ne peut pas dépasser 50 caractères')
  .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Contient des caractères invalides');

const roleField = z.enum(['ADMIN', 'RH_RECRUITER', 'SALES', 'MAGASIN'], {
  errorMap: () => ({ message: 'Rôle invalide. Valeurs : ADMIN, RH_RECRUITER, SALES, MAGASIN' }),
});

export const createUserSchema = z.object({
  email: emailField,
  password: passwordField,
  firstName: nameField,
  lastName: nameField,
  role: roleField,
});

export const updateUserSchema = z.object({
  firstName: nameField.optional(),
  lastName: nameField.optional(),
  email: emailField.optional(),
  role: roleField.optional(),
  isActive: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  password: passwordField,
});
