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
  const digits = phone.replace(/\D/g, '');
  const last10 = digits.slice(-10);
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
 * Lève une ApiError 422 si aucun contact GHL n'est trouvé.
 */
export async function sendSignatureSms(opts: {
  phone?: string | null;
  email?: string | null;
  firstName?: string | null;
  url: string;
  kind: 'pret' | 'retour';
}): Promise<{ contactId: string; messageId?: string }> {
  const contactId = await resolveGhlContactId(opts.phone, opts.email);
  if (!contactId) {
    throw new ApiError(
      422,
      "Aucun contact GHL trouvé pour cet agent (téléphone/email). Utilisez la signature au comptoir.",
      'GHL_CONTACT_INTROUVABLE'
    );
  }

  const label = opts.kind === 'retour' ? "retour" : "prêt";
  const message =
    `Bonjour ${opts.firstName || ''}`.trim() +
    `, veuillez signer votre formulaire de ${label} d'uniforme XGuard : ${opts.url}`;

  const res = await sendSms(contactId, message);
  return { contactId, messageId: res.messageId };
}
