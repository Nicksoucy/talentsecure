/**
 * Service d'envoi d'emails via SMTP (nodemailer).
 *
 * Configuration via les env existantes :
 *   - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE
 *
 * Adresses destinataires standard :
 *   - EMAIL_RH (défaut: rh@xguard.ca)
 *   - EMAIL_PAIE (défaut: paie@xguard.ca)
 *   - EMAIL_FROM (défaut: SMTP_USER)
 *
 * Les templates sont des fichiers HTML simples dans src/templates/email/
 * Les variables sont remplacées par interpolation `{{name}}` (handlebars-light).
 */
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';

export const EMAIL_RH = process.env.EMAIL_RH || 'rh@xguard.ca';
export const EMAIL_PAIE = process.env.EMAIL_PAIE || 'paie@xguard.ca';
export const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USER || 'no-reply@xguard.ca';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error('SMTP env not configured (SMTP_HOST, SMTP_USER, SMTP_PASSWORD required)');
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  return transporter;
}

export interface SendEmailInput {
  to: string | string[];
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  messageId: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const t = getTransporter();
  const info = await t.sendMail({
    from: input.from || EMAIL_FROM,
    to: Array.isArray(input.to) ? input.to.join(', ') : input.to,
    cc: input.cc && input.cc.length > 0 ? input.cc.join(', ') : undefined,
    subject: input.subject,
    html: input.html,
    text: input.text || stripHtml(input.html),
    replyTo: input.replyTo,
  });
  return { messageId: info.messageId };
}

/** Vérifie que le transporter est correctement configuré (au démarrage). */
export async function verifyEmailService(): Promise<boolean> {
  try {
    const t = getTransporter();
    await t.verify();
    return true;
  } catch (e) {
    console.warn('[email] verify failed:', (e as Error).message);
    return false;
  }
}

/** Retire les blocs <tag …>…</tag> par balayage linéaire (pas de regex à retour arrière). */
function removeBlocks(html: string, tag: string): string {
  const lower = html.toLowerCase();
  let out = '';
  let i = 0;
  for (;;) {
    const start = lower.indexOf(`<${tag}`, i);
    if (start === -1) break;
    const end = lower.indexOf(`</${tag}`, start);
    if (end === -1) break;
    const close = lower.indexOf('>', end);
    out += html.slice(i, start);
    i = close === -1 ? html.length : close + 1;
  }
  return out + html.slice(i);
}

/**
 * Strip HTML pour générer une version texte de secours. Linéaire : le HTML peut
 * contenir du texte saisi par RH (lettre de fermeture de dossier) — une regex
 * polynomiale (`<style[^>]*>.*?</style>`) serait exploitable (ReDoS).
 */
export function stripHtml(html: string): string {
  const noBlocks = removeBlocks(removeBlocks(html, 'style'), 'script');
  let out = '';
  let inTag = false;
  for (const ch of noBlocks) {
    if (ch === '<') inTag = true;
    else if (ch === '>' && inTag) { inTag = false; out += ' '; }
    else if (!inTag) out += ch;
  }
  return out.split(/\s/).filter(Boolean).join(' ');
}

/**
 * Charge un template HTML depuis src/templates/email/<name>.html et remplace
 * les variables {{key}} par les valeurs fournies. Gère aussi {{#each items}}…{{/each}}.
 */
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'email');
const templateCache = new Map<string, string>();

export function renderTemplate(templateName: string, vars: Record<string, unknown>): { html: string; text: string } {
  let raw = templateCache.get(templateName);
  if (!raw) {
    const filePath = path.join(TEMPLATES_DIR, `${templateName}.html`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Template introuvable : ${filePath}`);
    }
    raw = fs.readFileSync(filePath, 'utf-8');
    if (process.env.NODE_ENV === 'production') templateCache.set(templateName, raw);
  }

  let html = raw;

  // {{#each items}} <li>{{name}} — {{qty}}</li> {{/each}}
  html = html.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_m, key: string, block: string) => {
    const list = vars[key];
    if (!Array.isArray(list)) return '';
    return list
      .map((item) =>
        block.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_m2, k: string) => {
          const v = k.split('.').reduce<any>((acc: any, p: string) => (acc == null ? acc : acc[p]), item);
          return v == null ? '' : String(v);
        }),
      )
      .join('');
  });

  // {{#if cond}}…{{/if}}
  html = html.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, key: string, block: string) => {
    return vars[key] ? block : '';
  });

  // {{key}} simple
  html = html.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_m, key: string) => {
    const v = key.split('.').reduce<any>((acc: any, p: string) => (acc == null ? acc : acc[p]), vars);
    return v == null ? '' : String(v);
  });

  return { html, text: stripHtml(html) };
}
