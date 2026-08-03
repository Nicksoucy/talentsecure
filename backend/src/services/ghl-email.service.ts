/**
 * Envoi d'emails via GoHighLevel (LeadConnector).
 *
 * Pattern identique à sms.service.ts : on utilise le même PIT token + location.
 * Différences :
 *   - endpoint /conversations/messages avec type='Email'
 *   - requiert un contactId : on fait findOrCreate par email (idempotent)
 *   - subject + html requis
 *
 * Avantage : tracking unifié dans la GHL Inbox, plus besoin de SMTP séparé.
 * Limite : chaque destinataire devient un contact GHL — pour les boîtes
 * internes (rh@/paie@) on crée des contacts "système" taggés.
 */
import { ApiError } from '../utils/apiError';
import { findContactIdBy, getGhlLocationId, ghlRequest, GhlApiError } from './ghl.client';

/** Recherche un contact GHL par email. Retourne le contactId ou null. */
export async function findContactByEmail(email: string): Promise<string | null> {
  return findContactIdBy('email', email);
}

/**
 * Crée un nouveau contact GHL pour une adresse interne (rh@, paie@, etc.).
 * Tague `talentsecure-system` pour distinguer des vrais leads.
 */
export async function createSystemContact(email: string, name?: string): Promise<string> {
  const safeName = name || email.split('@')[0];
  const data = await ghlRequest<any>('/contacts/', {
    method: 'POST',
    body: {
      locationId: getGhlLocationId(),
      email,
      firstName: safeName,
      lastName: '(Système TalentSecure)',
      tags: ['talentsecure-system', 'uniform-notifications'],
      source: 'TalentSecure V2',
    },
  });
  return data?.contact?.id || data?.id;
}

/** Trouve OU crée un contact pour cette adresse email. */
export async function findOrCreateContactByEmail(email: string, name?: string): Promise<string> {
  const existing = await findContactByEmail(email);
  if (existing) return existing;
  return createSystemContact(email, name);
}

export interface SendGhlEmailInput {
  to: string;
  subject: string;
  html: string;
  contactName?: string;
}

export interface SendGhlEmailResult {
  messageId?: string;
  contactId: string;
}

/**
 * Envoie un email via GHL à une adresse arbitraire (crée le contact si nécessaire).
 * Lève une ApiError 502 si l'envoi échoue.
 */
export async function sendEmailViaGhl(input: SendGhlEmailInput): Promise<SendGhlEmailResult> {
  const contactId = await findOrCreateContactByEmail(input.to, input.contactName);
  try {
    const data = await ghlRequest<any>('/conversations/messages', {
      method: 'POST',
      timeoutMs: 30_000,
      body: {
        type: 'Email',
        contactId,
        subject: input.subject,
        html: input.html,
        emailTo: input.to, // certains plans GHL acceptent cet override
      },
    });
    return {
      messageId: data?.messageId || data?.emailMessageId || data?.conversationId,
      contactId,
    };
  } catch (e: any) {
    const detail =
      e instanceof GhlApiError
        ? (e.body as any)?.message || e.body || e.message
        : e?.message || 'inconnu';
    throw new ApiError(502, `GHL email échoué : ${JSON.stringify(detail)}`, 'GHL_EMAIL_FAILED');
  }
}
