/**
 * Client GoHighLevel (LeadConnector) — API v2, Private Integration Token.
 *
 * Point d'entrée UNIQUE vers l'API GHL. Avant ce fichier, le base URL, le PIT et
 * la location étaient copiés-collés dans 4 modules, chacun avec un token de
 * production en dur comme fallback `||` (dette S1 du README). Ici : aucune
 * valeur par défaut, le token vient de l'environnement ou l'appel échoue.
 *
 * Le token est lu à CHAQUE appel, pas au chargement du module :
 *  - l'app doit pouvoir démarrer sans credentials GHL (dev local, tests) ;
 *  - seul un appel réellement effectué doit échouer.
 */

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';
const DEFAULT_TIMEOUT_MS = 20_000;

export class GhlConfigError extends Error {
  constructor(varName: string) {
    super(
      `${varName} n'est pas configuré. Renseignez-le dans l'environnement ` +
        '(variables Cloud Run en production, backend/.env en local).'
    );
    this.name = 'GhlConfigError';
  }
}

/**
 * Extrait l'explication lisible d'un corps d'erreur GHL.
 * GHL renvoie tantôt `{ message }`, tantôt `{ error }`, tantôt du texte brut.
 */
function extractGhlMessage(body: unknown): string | null {
  if (!body) return null;
  if (typeof body === 'string') return body.slice(0, 300) || null;
  if (typeof body === 'object') {
    const o = body as Record<string, unknown>;
    const raw = o.message ?? o.error ?? o.msg;
    if (typeof raw === 'string' && raw.trim()) return raw.slice(0, 300);
    if (Array.isArray(raw) && raw.length > 0) return String(raw[0]).slice(0, 300);
  }
  return null;
}

export class GhlApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: unknown
  ) {
    // L'explication de GHL est intégrée au `message` et pas seulement rangée
    // dans `body` : les appelants historiques lisaient la forme d'erreur d'axios
    // (`err.response.data.message`) et retombent maintenant sur `err.message`.
    // Sans ça, RH verrait « échec » sans jamais savoir POURQUOI le SMS a raté.
    const detail = extractGhlMessage(body);
    super(detail ? `GHL ${path} → ${status} : ${detail}` : `GHL ${path} → ${status}`);
    this.name = 'GhlApiError';
  }
}

export function getGhlToken(): string {
  const token = process.env.GHL_PIT_TOKEN?.trim();
  if (!token) throw new GhlConfigError('GHL_PIT_TOKEN');
  return token;
}

export function getGhlLocationId(): string {
  const location = process.env.GHL_LOCATION_ID?.trim();
  if (!location) throw new GhlConfigError('GHL_LOCATION_ID');
  return location;
}

/** True si les credentials sont présents — pour les chemins best-effort. */
export function isGhlConfigured(): boolean {
  return Boolean(process.env.GHL_PIT_TOKEN?.trim() && process.env.GHL_LOCATION_ID?.trim());
}

export function ghlHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${getGhlToken()}`,
    Version: GHL_API_VERSION,
    ...extra,
  };
}

interface GhlRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Paramètres de query string. Les valeurs `undefined`/`null` sont omises. */
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
  timeoutMs?: number;
}

/**
 * Appel brut à l'API GHL. Lève `GhlApiError` sur réponse non-2xx et
 * `GhlConfigError` si le token manque.
 */
export async function ghlRequest<T = any>(path: string, options: GhlRequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const url = new URL(`${GHL_BASE}${path}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = ghlHeaders(body !== undefined ? { 'Content-Type': 'application/json' } : undefined);

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    // Le corps d'erreur peut être du JSON ou du texte : on prend ce qui vient.
    const detail = await res.text().catch(() => '');
    let parsed: unknown = detail;
    try {
      parsed = JSON.parse(detail);
    } catch {
      /* garder le texte brut */
    }
    throw new GhlApiError(res.status, path, parsed);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface GhlContact {
  id: string;
  locationId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateAdded?: string;
  dateUpdated?: string;
  customFields?: Array<{ id: string; value: unknown }>;
  [key: string]: unknown;
}

/** Récupère un contact par son id. Retourne null s'il n'existe pas (404). */
export async function getContactById(contactId: string): Promise<GhlContact | null> {
  try {
    const data = await ghlRequest<{ contact?: GhlContact }>(`/contacts/${encodeURIComponent(contactId)}`);
    return data?.contact ?? null;
  } catch (e) {
    if (e instanceof GhlApiError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
}

/**
 * Recherche un contact existant par email ou téléphone.
 *
 * NB : l'endpoint `search/duplicate` attend `number` pour le téléphone
 * (et `email` pour le courriel) — PAS `phone`.
 */
export async function findContactIdBy(key: 'email' | 'number', value: string): Promise<string | null> {
  try {
    const data = await ghlRequest<{ contact?: { id?: string } }>('/contacts/search/duplicate', {
      query: { locationId: getGhlLocationId(), [key]: value },
    });
    return data?.contact?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Écrit un custom field sur un contact, en le désignant par sa `key` GHL
 * (ex. `video_recue`) plutôt que par son id — les ids ne sont pas stables
 * entre les environnements.
 */
export async function setContactCustomField(
  contactId: string,
  fieldKey: string,
  value: string
): Promise<void> {
  await ghlRequest(`/contacts/${encodeURIComponent(contactId)}`, {
    method: 'PUT',
    body: { customFields: [{ key: fieldKey, field_value: value }] },
  });
}

export { GHL_BASE, GHL_API_VERSION };
