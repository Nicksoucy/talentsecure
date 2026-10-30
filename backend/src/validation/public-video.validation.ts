/**
 * Schémas de validation de la page publique de téléversement vidéo.
 *
 * Ces endpoints ne sont pas authentifiés : tout ce qui entre est hostile par
 * défaut. On valide donc strictement la forme AVANT de toucher à GHL ou à R2.
 */
import { z } from 'zod';

/**
 * Identifiant de contact GoHighLevel. Chaîne opaque d'une vingtaine de
 * caractères ; on borne longueur et alphabet pour éviter qu'elle serve de
 * véhicule à autre chose (injection de chemin dans la clé R2, notamment).
 */
export const ghlContactIdSchema = z
  .string()
  .trim()
  .min(10, 'Lien invalide')
  .max(64, 'Lien invalide')
  .regex(/^[A-Za-z0-9_-]+$/, 'Lien invalide');

/** True si la valeur ressemble à un identifiant de contact GHL exploitable. */
export function isUsableContactId(value: unknown): boolean {
  return ghlContactIdSchema.safeParse(value).success;
}

/**
 * Le formulaire GHL peut transmettre l'identifiant sous `c` (notre paramètre)
 * ou `contact_id` (celui que GHL ajoute lui-même) — on accepte les deux.
 *
 * Les deux sont volontairement typés en `string` libre plutôt qu'en identifiant
 * strict : si la redirection GHL n'interpole pas son merge field, `c` arrive
 * littéralement à `{{contact.id}}`. Rejeter la requête à ce moment-là ferait
 * afficher « lien invalide » au candidat alors qu'un `contact_id` parfaitement
 * valide peut se trouver juste à côté. On exige donc seulement qu'AU MOINS UN
 * des deux soit exploitable, et le contrôleur retient celui-là.
 */
export const videoSessionQuerySchema = z
  .object({
    c: z.string().trim().max(200).optional(),
    contact_id: z.string().trim().max(200).optional(),
  })
  .refine((data) => isUsableContactId(data.c) || isUsableContactId(data.contact_id), {
    message: 'Identifiant de contact manquant',
    path: ['c'],
  });

/** 500 Mo — tient dans un int32 et couvre une vidéo de téléphone en 4K. */
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

/**
 * Conteneurs acceptés. Volontairement restreint aux formats que les navigateurs
 * produisent (MediaRecorder → webm/mp4) et que les téléphones exportent
 * (mp4/mov). Les paramètres de codec sont retirés avant validation : Chrome
 * annonce `video/webm;codecs=vp8,opus`, et le Content-Type signé doit
 * correspondre AU CARACTÈRE PRÈS à celui envoyé au PUT.
 */
export const ALLOWED_VIDEO_MIME = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo',
  'video/mpeg',
  'video/3gpp',
] as const;

/** Retire les paramètres (`;codecs=…`) et normalise la casse. */
export function normalizeMimeType(raw: string): string {
  return raw.split(';')[0].trim().toLowerCase();
}

const videoContentTypeSchema = z
  .string()
  .trim()
  .max(120)
  .transform(normalizeMimeType)
  .refine((mime) => (ALLOWED_VIDEO_MIME as readonly string[]).includes(mime), {
    message: 'Format vidéo non supporté',
  });

export const initiateUploadSchema = z.object({
  c: ghlContactIdSchema,
  filename: z.string().trim().min(1).max(255),
  contentType: videoContentTypeSchema,
  sizeBytes: z
    .number()
    .int('Taille invalide')
    .positive('Taille invalide')
    .max(MAX_VIDEO_BYTES, 'Vidéo trop volumineuse (maximum 500 Mo)'),
});

export const completeUploadSchema = z.object({
  c: ghlContactIdSchema,
  key: z.string().trim().min(1).max(512),
});

// ── Lien général (/video) ───────────────────────────────────────────────────
//
// Lien sans identifiant, qu'on peut texter ou publier librement. Faute de
// contact GHL, c'est le candidat qui donne ses coordonnées : le téléphone est
// obligatoire (une fiche prospect ne peut pas exister sans), le courriel non.

/** Téléphone nord-américain : 10 chiffres, ou 11 avec l'indicatif 1. */
function digitsOf(phone: string): string {
  return phone.replace(/\D/g, '');
}

const openContactShape = {
  firstName: z.string().trim().min(1, 'Prénom requis').max(80),
  lastName: z.string().trim().min(1, 'Nom requis').max(80),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((p) => {
      const d = digitsOf(p);
      return d.length === 10 || (d.length === 11 && d.startsWith('1'));
    }, 'Numéro de téléphone invalide'),
  email: z
    .string()
    .trim()
    .max(200)
    .email('Courriel invalide')
    .optional()
    .or(z.literal('').transform(() => undefined)),
};

export const openInitiateUploadSchema = z.object({
  ...openContactShape,
  filename: initiateUploadSchema.shape.filename,
  contentType: videoContentTypeSchema,
  sizeBytes: initiateUploadSchema.shape.sizeBytes,
});

export const openCompleteUploadSchema = z.object({
  ...openContactShape,
  key: completeUploadSchema.shape.key,
  filename: z.string().trim().max(255).optional(),
});

export type OpenContact = {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
};
