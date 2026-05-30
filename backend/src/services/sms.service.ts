/**
 * Envoi de SMS via GoHighLevel (LeadConnector).
 *
 * Réutilise la même connexion/headers que l'intégration GHL existante
 * (survey-sync.service.ts / tag-employees-ghl.ts). L'envoi sortant
 * (conversations/messages) est NOUVEAU : il requiert le scope d'écriture sur la
 * location + un numéro SMS provisionné. Si le contact GHL est introuvable, on
 * lève une 422 pour que l'UI bascule sur la signature au comptoir.
 */
import axios from 'axios';
import { ApiError } from '../utils/apiError';
import { lastTenDigits } from '../utils/phone';

const GHL_TOKEN = process.env.GHL_PIT_TOKEN || 'pit-7de455ab-c46e-47a4-af9e-0b07a6c3a1ee';
const GHL_LOCATION = process.env.GHL_LOCATION_ID || 'dfkLurZY2ADWAUZl4zYc';
const GHL_BASE = 'https://services.leadconnectorhq.com';
const H = { Authorization: `Bearer ${GHL_TOKEN}`, Version: '2021-07-28' };

/**
 * Génère les variantes plausibles d'un numéro pour la recherche GHL.
 * GHL stocke souvent en E.164 (+1XXXXXXXXXX) ; les employés peuvent être saisis
 * en "514-916-3269" ou "5149163269" → on essaie plusieurs formats.
 */
function phoneCandidates(phone: string): string[] {
  const last10 = lastTenDigits(phone);
  const set = new Set<string>([phone.trim()]);
  if (last10.length === 10) {
    set.add(`+1${last10}`);
    set.add(`1${last10}`);
    set.add(last10);
  }
  return [...set].filter(Boolean);
}

// NB: l'endpoint GHL "search/duplicate" attend `number` pour le téléphone
// (et `email` pour le courriel) — PAS `phone`.
async function searchByParam(key: 'number' | 'email', value: string): Promise<string | null> {
  try {
    const r = await axios.get(`${GHL_BASE}/contacts/search/duplicate`, {
      params: { locationId: GHL_LOCATION, [key]: value },
      headers: H,
      timeout: 20000,
    });
    return r.data?.contact?.id ?? null;
  } catch {
    return null;
  }
}

/** Retrouve le contactId GHL d'un agent par téléphone (plusieurs formats) puis email. */
export async function resolveGhlContactId(
  phone?: string | null,
  email?: string | null
): Promise<string | null> {
  if (phone) {
    for (const candidate of phoneCandidates(phone)) {
      const id = await searchByParam('number', candidate);
      if (id) return id;
    }
  }
  if (email) {
    const id = await searchByParam('email', email);
    if (id) return id;
  }
  return null;
}

/** Envoie un SMS à un contact GHL. */
export async function sendSms(contactId: string, message: string): Promise<{ messageId?: string }> {
  const r = await axios.post(
    `${GHL_BASE}/conversations/messages`,
    { type: 'SMS', contactId, message },
    { headers: { ...H, 'Content-Type': 'application/json' }, timeout: 20000 }
  );
  return {
    messageId: r.data?.messageId || r.data?.messageIds?.[0] || r.data?.conversationId,
  };
}

/**
 * Envoie le lien de signature d'un formulaire (prêt ou retour) à un agent.
 *
 * Distingue clairement 3 causes d'échec pour que l'UI affiche un message
 * actionnable :
 *  - TELEPHONE_MANQUANT (422)     : aucune coordonnée au dossier de l'agent.
 *  - GHL_CONTACT_INTROUVABLE (422): coordonnées présentes mais aucun contact GHL
 *                                   correspondant (jamais synchronisé / numéro erroné).
 *  - GHL_ENVOI_ECHEC (502)        : le contact existe mais l'envoi a planté côté
 *                                   GHL (problème technique, numéro non-SMS, etc.).
 */
export async function sendSignatureSms(opts: {
  phone?: string | null;
  email?: string | null;
  firstName?: string | null;
  url: string;
  kind: 'pret' | 'retour';
}): Promise<{ contactId: string; messageId?: string }> {
  const hasPhone = !!opts.phone && opts.phone.trim().length > 0;
  const hasEmail = !!opts.email && opts.email.trim().length > 0;

  // Cas 1 — aucune coordonnée au dossier : on ne peut rien tenter.
  if (!hasPhone && !hasEmail) {
    throw new ApiError(
      422,
      "Aucun numéro de téléphone au dossier de cet agent. Ajoutez son numéro sur sa fiche employé, puis réessayez — ou utilisez la signature au comptoir.",
      'TELEPHONE_MANQUANT'
    );
  }

  // Cas 2 — coordonnées présentes mais aucun contact GHL correspondant.
  const contactId = await resolveGhlContactId(opts.phone, opts.email);
  if (!contactId) {
    throw new ApiError(
      422,
      hasPhone
        ? `Le numéro « ${opts.phone} » ne correspond à aucun contact GHL (agent jamais synchronisé ou numéro erroné). Vérifiez le numéro sur sa fiche, ou utilisez la signature au comptoir.`
        : "Aucun contact GHL ne correspond au courriel de cet agent. Ajoutez un numéro de téléphone valide sur sa fiche, ou utilisez la signature au comptoir.",
      'GHL_CONTACT_INTROUVABLE'
    );
  }

  const label = opts.kind === 'retour' ? "retour" : "prêt";
  const message =
    `Bonjour ${opts.firstName || ''}`.trim() +
    `, veuillez signer votre formulaire de ${label} d'uniforme XGuard : ${opts.url}`;

  // Cas 3 — le contact existe mais l'envoi échoue (API GHL, numéro non-SMS, etc.).
  try {
    const res = await sendSms(contactId, message);
    return { contactId, messageId: res.messageId };
  } catch (err: any) {
    const detail =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      'erreur inconnue';
    throw new ApiError(
      502,
      `Le contact existe dans GHL mais l'envoi du SMS a échoué (${detail}). C'est un problème technique d'envoi (pas un numéro manquant) — réessayez, ou utilisez la signature au comptoir.`,
      'GHL_ENVOI_ECHEC'
    );
  }
}
