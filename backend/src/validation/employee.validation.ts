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

/** « Fermer le dossier » : motif, paragraphe (retouchable), jour limite, texto. */
export const employeeClosureSchema = z.object({
  reason: z.enum(['INACTIVITE', 'DEMISSION', 'FIN_EMPLOI', 'AUTRE']),
  reasonText: z.string().trim().min(1, 'Le paragraphe du motif est requis').max(5000),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date limite invalide (AAAA-MM-JJ)'),
  sendSms: z.boolean().optional().default(false),
  uniformsReceived: z.boolean().optional().default(false),
});

/** Fermer le dossier SANS rien envoyer (uniformes déjà rapportés, aucun uniforme…). */
export const employeeSilentClosureSchema = z.object({
  reason: z.enum(['INACTIVITE', 'DEMISSION', 'FIN_EMPLOI', 'AUTRE']),
  // Date limite : seulement si l'employé détient encore des pièces.
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date limite invalide (AAAA-MM-JJ)').optional(),
  // Courriel à la paie (CC RH) : dossier fermé + état des uniformes. Rien à l'employé.
  notifyPayroll: z.boolean().optional().default(false),
  note: z.string().trim().max(2000).optional(),
  // « Fermeture avec réception des uniformes » : confirme la réception à la paie (RH en copie).
  uniformsReceived: z.boolean().optional().default(false),
}).strict();

/** « Renvoyer » un avis : aucun paramètre — le texte original est réutilisé. */
export const employeeClosureResendSchema = z.object({}).strict();
