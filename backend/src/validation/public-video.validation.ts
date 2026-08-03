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

/**
 * Le formulaire GHL peut transmettre l'identifiant sous `c` (notre paramètre)
 * ou `contact_id` (celui que GHL ajoute lui-même) — on accepte les deux.
 */
export const videoSessionQuerySchema = z
  .object({
    c: ghlContactIdSchema.optional(),
    contact_id: ghlContactIdSchema.optional(),
  })
  .refine((data) => Boolean(data.c || data.contact_id), {
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
