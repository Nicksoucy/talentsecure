/**
 * Téléversement public de la vidéo de présentation (page /ma-video).
 *
 * Pourquoi ces endpoints existent : le champ fichier d'un formulaire GoHighLevel
 * est plafonné à 50 Mo, ce qui exclut exactement les candidats qui prennent la
 * peine de faire une bonne vidéo. GHL ne permet pas de brancher un uploader
 * maison dans son formulaire — on héberge donc l'étape vidéo ici, et le
 * formulaire GHL passe le relais par redirection.
 *
 * Les octets vont NAVIGATEUR → R2 directement, via une URL présignée : la
 * limite de 32 Mio par requête de Cloud Run n'est jamais rencontrée.
 *
 * Modèle de sécurité (aucune authentification possible : le candidat n'a pas de
 * compte) :
 *   - le lien porte le contactId GHL, une chaîne opaque non devinable ;
 *   - chaque appel le revalide contre l'API GHL (le contact existe, il est dans
 *     NOTRE location, et il est récent) ;
 *   - l'URL présignée fige le type ET la taille : R2 refuse tout autre corps ;
 *   - après coup, on vérifie les magic bytes et on supprime ce qui n'est pas
 *     une vraie vidéo ;
 *   - rate limit par IP sur les trois routes.
 */
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { getContactById, getGhlLocationId, setContactCustomField, GhlContact } from '../services/ghl.client';
import {
  deleteFileFromR2,
  getConstrainedUploadUrl,
  headObjectInR2,
  readObjectPrefix,
  useR2,
} from '../services/r2.service';
import { isLikelyVideo } from '../utils/ghlFetch';
import { ApiError } from '../utils/apiError';
import { recordUpload } from '../services/pending-video.service';
import { findMatchingProspect } from '../utils/candidateMatch';
import { MAX_VIDEO_BYTES, normalizeMimeType } from '../validation/public-video.validation';
import logger from '../config/logger';

/**
 * Fenêtre pendant laquelle un lien reste utilisable après la dernière activité
 * du contact. Doit couvrir le workflow de rappel GHL (2 h, puis 24 h).
 */
const LINK_TTL_MS = 72 * 60 * 60 * 1000;

const UPLOAD_URL_TTL_SECONDS = 900;

/** Clé du custom field GHL marquant que la vidéo a été reçue. */
const VIDEO_RECEIVED_FIELD_KEY = process.env.GHL_VIDEO_RECEIVED_FIELD_KEY || 'video_recue';

/** Extension déduite du type MIME — la clé R2 ne fait jamais confiance au nom fourni. */
const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
  'video/x-msvideo': '.avi',
  'video/mpeg': '.mpeg',
  'video/3gpp': '.3gp',
};

/** Réponse unique pour tous les liens refusés : pas d'oracle d'énumération. */
function invalidLinkError(): ApiError {
  return new ApiError(
    404,
    "Ce lien n'est plus valide. Demandez-nous un nouveau lien pour envoyer votre vidéo.",
    'LIEN_INVALIDE'
  );
}

/**
 * GHL injoignable ou mal configuré. Surtout NE PAS répondre « lien invalide » :
 * le candidat croirait que son lien est mort et abandonnerait, alors que le
 * problème est chez nous et se résoudra tout seul.
 */
function ghlUnavailableError(): ApiError {
  return new ApiError(
    503,
    'Notre service est momentanément indisponible. Réessayez dans quelques minutes.',
    'SERVICE_INDISPONIBLE'
  );
}

function contactIdFrom(req: Request): string {
  return String((req.query.c ?? req.query.contact_id ?? req.body?.c ?? '') as string);
}

type ContactLookup =
  | { ok: true; contact: GhlContact }
  | { ok: false; reason: 'invalid' | 'unavailable' };

/**
 * Récupère et valide le contact GHL derrière un lien.
 *
 * Distingue « ce lien n'est pas honorable » (inconnu, autre location, trop
 * ancien) de « on n'a pas pu vérifier » (GHL en panne, token expiré) : les deux
 * méritent des réponses très différentes côté candidat.
 */
async function resolveContact(contactId: string): Promise<ContactLookup> {
  let contact: GhlContact | null;
  try {
    contact = await getContactById(contactId);
  } catch (e: any) {
    logger.error('Validation du lien vidéo impossible (GHL)', { error: e?.message });
    return { ok: false, reason: 'unavailable' };
  }
  if (!contact) return { ok: false, reason: 'invalid' };

  // Un contact d'un autre sous-compte n'a rien à faire ici.
  try {
    if (contact.locationId && contact.locationId !== getGhlLocationId()) {
      return { ok: false, reason: 'invalid' };
    }
  } catch (e: any) {
    logger.error('GHL_LOCATION_ID absent — validation du lien impossible', { error: e?.message });
    return { ok: false, reason: 'unavailable' };
  }

  // Fraîcheur : on prend la plus récente des deux dates connues.
  const stamps = [contact.dateAdded, contact.dateUpdated]
    .map((d) => (d ? Date.parse(d) : NaN))
    .filter((t) => Number.isFinite(t)) as number[];
  if (stamps.length > 0 && Date.now() - Math.max(...stamps) > LINK_TTL_MS) {
    return { ok: false, reason: 'invalid' };
  }

  return { ok: true, contact };
}

/** Traduit un échec de résolution en erreur d'API. */
function lookupError(reason: 'invalid' | 'unavailable'): ApiError {
  return reason === 'unavailable' ? ghlUnavailableError() : invalidLinkError();
}

/** True si ce contact a déjà une vidéo (en attente ou déjà rattachée). */
async function hasVideoAlready(contact: GhlContact): Promise<boolean> {
  const pending = await prisma.pendingVideoUpload.findUnique({
    where: { ghlContactId: contact.id },
    select: { id: true },
  });
  if (pending) return true;

  const prospect = await findMatchingProspect(prisma, contact.email, contact.phone);
  if (!prospect) return false;

  const full = await prisma.prospectCandidate.findUnique({
    where: { id: prospect.id },
    select: { videoStoragePath: true },
  });
  return Boolean(full?.videoStoragePath);
}

/**
 * GET /api/public/video/session?c=…
 *
 * Vérifie le lien et renvoie le strict minimum pour personnaliser la page : le
 * prénom, et si une vidéo a déjà été reçue. Rien d'autre — c'est un endpoint
 * public, chaque champ renvoyé est une fuite potentielle.
 */
export const getVideoSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contactId = contactIdFrom(req);
    const lookup = await resolveContact(contactId);
    if (!lookup.ok) throw lookupError(lookup.reason);
    const { contact } = lookup;

    return res.json({
      firstName: contact.firstName || null,
      alreadyUploaded: await hasVideoAlready(contact),
      maxBytes: MAX_VIDEO_BYTES,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/public/video/initiate
 *
 * Renvoie une URL présignée PUT vers R2. Le `contentType` renvoyé est normalisé
 * et DOIT être réutilisé tel quel comme en-tête du PUT : il fait partie de la
 * signature, tout écart la casse.
 */
export const initiateVideoUpload = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!useR2) {
      throw new ApiError(
        503,
        "Le stockage vidéo n'est pas configuré sur ce serveur.",
        'STOCKAGE_INDISPONIBLE'
      );
    }

    const { c: contactId, contentType, sizeBytes } = req.body as {
      c: string;
      filename: string;
      contentType: string;
      sizeBytes: number;
    };

    const lookup = await resolveContact(contactId);
    if (!lookup.ok) throw lookupError(lookup.reason);

    // La clé est construite entièrement côté serveur : le contactId est validé
    // par un alphabet restreint, l'extension vient du MIME, le reste est un
    // UUID. Aucun fragment fourni par le client n'atterrit dans le chemin.
    const ext = EXT_BY_MIME[contentType] || '.bin';
    const key = `videos/inbox/${contactId}/${crypto.randomUUID()}${ext}`;

    const uploadUrl = await getConstrainedUploadUrl({
      key,
      contentType,
      exactBytes: sizeBytes,
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    });

    return res.json({
      uploadUrl,
      key,
      contentType,
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/public/video/complete
 *
 * Confirme le téléversement : vérifie que l'objet existe vraiment, que c'est
 * bien une vidéo, puis le gare dans `pending_video_uploads` où il sera rattaché
 * au prospect (tout de suite s'il existe, sinon à sa création).
 */
export const completeVideoUpload = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { c: contactId, key } = req.body as { c: string; key: string };

    const lookup = await resolveContact(contactId);
    if (!lookup.ok) throw lookupError(lookup.reason);
    const { contact } = lookup;

    // La clé doit être une de celles qu'on a émises pour CE contact — sinon
    // n'importe qui pourrait s'attribuer un objet arbitraire du bucket.
    if (!key.startsWith(`videos/inbox/${contactId}/`)) throw invalidLinkError();

    const head = await headObjectInR2(key);
    if (!head) {
      throw new ApiError(
        400,
        "Le téléversement ne s'est pas terminé. Réessayez.",
        'TELEVERSEMENT_INTROUVABLE'
      );
    }
    if (head.contentLength <= 100 || head.contentLength > MAX_VIDEO_BYTES) {
      await deleteFileFromR2(key).catch(() => undefined);
      throw new ApiError(400, 'Le fichier reçu est vide ou trop volumineux.', 'FICHIER_INVALIDE');
    }

    // Magic bytes : un `Content-Type` déclaré ne prouve rien. On lit seulement
    // les premiers Ko — jamais les 500 Mo dans la mémoire de Cloud Run.
    const prefix = await readObjectPrefix(key, 4096);
    if (!prefix || !isLikelyVideo(prefix)) {
      await deleteFileFromR2(key).catch(() => undefined);
      throw new ApiError(
        400,
        "Ce fichier n'est pas une vidéo valide. Essayez avec un MP4 ou un MOV.",
        'FICHIER_NON_VIDEO'
      );
    }

    const result = await recordUpload({
      ghlContactId: contactId,
      email: contact.email,
      phone: contact.phone,
      storagePath: key,
      originalName: (req.body as any)?.filename || null,
      contentType: head.contentType ? normalizeMimeType(head.contentType) : null,
      sizeBytes: head.contentLength,
    });

    // Marque le contact côté GHL pour couper le workflow de rappel.
    // Best-effort : la vidéo est reçue, c'est ce qui compte.
    try {
      await setContactCustomField(contactId, VIDEO_RECEIVED_FIELD_KEY, 'true');
    } catch (e: any) {
      logger.warn('Marquage GHL "vidéo reçue" échoué', { contactId, error: e?.message });
    }

    return res.status(201).json({
      success: true,
      // `attached` = rattaché à une fiche existante ; sinon l'upload attend que
      // le webhook crée le prospect. Dans les deux cas c'est un succès pour le
      // candidat, la nuance n'est là que pour le debug.
      attached: result.claimed,
    });
  } catch (error) {
    return next(error);
  }
};
