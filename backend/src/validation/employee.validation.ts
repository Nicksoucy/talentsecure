import { z } from 'zod';

/**
 * Validation employé. Schémas NON-BLOQUANTS : `.passthrough()` conserve les
 * champs non listés (le controller lit via `buildEmployeeData`, une allowlist),
 * et on n'exige QUE les colonnes NOT NULL du modèle (firstName/lastName/phone)
 * — un create sans elles échouait déjà (500 Prisma), désormais 400 propre.
 */
const opt = (max: number) => z.string().max(max).optional().nullable();

export const createEmployeeSchema = z
  .object({
    firstName: z.string().max(100),
    lastName: z.string().max(100),
    phone: z.string().max(30),
    email: opt(255),
    address: opt(200),
    city: opt(100),
    province: opt(50),
    postalCode: opt(20),
    bspNumber: opt(50),
    notes: opt(5000),
  })
  .passthrough();

export const updateEmployeeSchema = z
  .object({
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional(),
    phone: z.string().max(30).optional(),
    email: opt(255),
    address: opt(200),
    city: opt(100),
    province: opt(50),
    postalCode: opt(20),
    bspNumber: opt(50),
    notes: opt(5000),
  })
  .passthrough();
