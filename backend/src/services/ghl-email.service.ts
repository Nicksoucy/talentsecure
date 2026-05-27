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
import axios from 'axios';
import { ApiError } from '../utils/apiError';

const GHL_TOKEN = process.env.GHL_PIT_TOKEN || 'pit-7de455ab-c46e-47a4-af9e-0b07a6c3a1ee';
const GHL_LOCATION = process.env.GHL_LOCATION_ID || 'dfkLurZY2ADWAUZl4zYc';
const GHL_BASE = 'https://services.leadconnectorhq.com';
const H = { Authorization: `Bearer ${GHL_TOKEN}`, Version: '2021-07-28' };

/** Recherche un contact GHL par email. Retourne le contactId ou null. */
export async function findContactByEmail(email: string): Promise<string | null> {
  try {
    const r = await axios.get(`${GHL_BASE}/contacts/search/duplicate`, {
      params: { locationId: GHL_LOCATION, email },
      headers: H,
      timeout: 20000,
    });
    return r.data?.contact?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Crée un nouveau contact GHL pour une adresse interne (rh@, paie@, etc.).
 * Tague `talentsecure-system` pour distinguer des vrais leads.
 */
export async function createSystemContact(email: string, name?: string): Promise<string> {
  const safeName = name || email.split('@')[0];
  const r = await axios.post(
    `${GHL_BASE}/contacts/`,
    {
      locationId: GHL_LOCATION,
      email,
      firstName: safeName,
      lastName: '(Système TalentSecure)',
      tags: ['talentsecure-system', 'uniform-notifications'],
      source: 'TalentSecure V2',
    },
    {
      headers: { ...H, 'Content-Type': 'application/json' },
      timeout: 20000,
    },
  );
  return r.data?.contact?.id || r.data?.id;
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
    const r = await axios.post(
      `${GHL_BASE}/conversations/messages`,
      {
        type: 'Email',
        contactId,
        subject: input.subject,
        html: input.html,
        emailTo: input.to, // certains plans GHL acceptent cet override
      },
      {
        headers: { ...H, 'Content-Type': 'application/json' },
        timeout: 30000,
      },
    );
    return {
      messageId: r.data?.messageId || r.data?.emailMessageId || r.data?.conversationId,
      contactId,
    };
  } catch (e: any) {
    const detail = e?.response?.data?.message || e?.response?.data || e?.message || 'inconnu';
    throw new ApiError(502, `GHL email échoué : ${JSON.stringify(detail)}`, 'GHL_EMAIL_FAILED');
  }
}
