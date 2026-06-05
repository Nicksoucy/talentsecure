import { prisma } from '../config/database';
import { downloadGhlFile, detectExtension, isLikelyVideo } from '../utils/ghlFetch';
import { uploadBufferToR2 } from '../services/r2.service';
import { findMatchingEmployee, findMatchingCandidate } from '../utils/candidateMatch';
import { canonicalCity } from '../utils/cityNormalize';
import logger from '../config/logger';

/**
 * Synchronisation du survey GHL "Recrutement - Candidature + Vidéo 30s".
 * Tire les soumissions via l'API GHL, télécharge CV + vidéo dans R2,
 * capte les réponses, et upsert les Candidats Potentiels.
 *
 * Règle "un seul endroit" : si la personne est déjà Employé ou Candidat,
 * on ne (re)crée pas de prospect (on lie/masque comme ailleurs).
 */

const GHL_TOKEN = process.env.GHL_PIT_TOKEN || 'pit-7de455ab-c46e-47a4-af9e-0b07a6c3a1ee';
const GHL_LOCATION = process.env.GHL_LOCATION_ID || 'dfkLurZY2ADWAUZl4zYc';
const GHL_BASE = 'https://services.leadconnectorhq.com';
const SURVEY_ID = process.env.GHL_SURVEY_ID || '7R37monCgHPJyTiinjn3';
const CV_FIELD = process.env.GHL_SURVEY_CV_FIELD || '2byZbDiiDflJ7pWGVNnC';
const VIDEO_FIELD = process.env.GHL_SURVEY_VIDEO_FIELD || 'FiITjfHeL2205bkCXNq2';

const H = { Authorization: `Bearer ${GHL_TOKEN}`, Version: '2021-07-28' };
const DOC_OR_IMG = ['pdf', 'wordprocessingml', 'msword', 'image/'];

export interface SyncSummary {
  scanned: number;
  created: number;
  updated: number;
  linkedExisting: number; // déjà employé/candidat → non créé
  skippedNoContact: number;
  errors: number;
  details: string[];
}

interface GhlFileRef { url: string; originalName: string; documentId: string; mimetype: string; field: string; }

/**
 * Scanne TOUS les champs de `others` et collecte les fichiers uploadés.
 * Les IDs de champs du survey ne sont PAS constants entre soumissions
 * (le survey a été édité) → on détecte par structure (objet { url, meta })
 * et on classe par type MIME, plutôt que par ID de champ fixe.
 */
function collectFiles(others: any): GhlFileRef[] {
  const files: GhlFileRef[] = [];
  for (const [field, val] of Object.entries(others || {})) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    for (const [uuid, fo] of Object.entries(val as Record<string, any>)) {
      if (fo && typeof fo === 'object' && fo.url && fo.meta) {
        files.push({
          url: fo.url,
          originalName: fo.meta.originalname || '',
          documentId: fo.documentId || uuid,
          mimetype: (fo.meta.mimetype || '').toLowerCase(),
          field,
        });
      }
    }
  }
  return files;
}

function findVideoFile(others: any): GhlFileRef | null {
  return collectFiles(others).find((f) => f.mimetype.startsWith('video/')) || null;
}

function findCvFile(others: any): GhlFileRef | null {
  const files = collectFiles(others);
  // Priorité aux documents (PDF / Word)
  const doc = files.find((f) => DOC_OR_IMG.slice(0, 3).some((m) => f.mimetype.includes(m)));
  if (doc) return doc;
  // Sinon, un CV en photo (image), en évitant la vidéo
  return files.find((f) => f.mimetype.startsWith('image/')) || null;
}

// Libellés lisibles des champs (codes GHL → questions). Les codes des
// questions custom proviennent du widget public du survey.
const FIELD_LABELS: Record<string, string> = {
  jNjbYKRbLQQaeePB1YOS: 'Véhicule',
  full_name: 'Nom complet',
  email: 'Courriel',
  phone: 'Téléphone',
  city: 'Ville',
  state: 'Province',
  country: 'Pays',
  postal_code: 'Code postal',
  address: 'Adresse',
  group_address: 'Adresse complète',
};

/** Réponses lisibles : libellés clairs, sans les champs techniques ni fichiers. */
function extractAnswers(others: any): Record<string, any> {
  const TECH = new Set([
    'eventData', 'sessionId', 'sessionFingerprint', 'formId', 'location_id',
    'fieldsOriSequance', 'submissionId', 'signatureHash', 'ip', 'Timezone',
  ]);
  const fileFields = new Set(collectFiles(others).map((f) => f.field));
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(others || {})) {
    if (TECH.has(k) || fileFields.has(k)) continue;
    const label = FIELD_LABELS[k] || k;
    let value: any = v;
    if (v && typeof v === 'object' && !Array.isArray(v)) value = (v as any).name ?? v;
    out[label] = value;
  }
  return out;
}

async function fetchAllSubmissions(): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  while (true) {
    const url = `${GHL_BASE}/surveys/submissions?locationId=${GHL_LOCATION}&surveyId=${SURVEY_ID}&limit=50&page=${page}`;
    const res = await fetch(url, { headers: H });
    if (!res.ok) throw new Error(`GHL submissions ${res.status}`);
    const data: any = await res.json();
    all.push(...(data.submissions || []));
    if (!data.meta?.nextPage) break;
    page++;
    await new Promise((r) => setTimeout(r, 150));
  }
  return all;
}

function sanitize(s: string): string {
  return (s || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) || 'cv';
}

/**
 * Traite une seule soumission (utilisé aussi par le webhook).
 * Retourne 'created' | 'updated' | 'linked' | 'skipped' | 'error'.
 */
export async function syncOneSubmission(sub: any): Promise<{ status: string; detail: string }> {
  const submissionId: string = sub.id;
  const name = (sub.name || '').trim();
  const email = (sub.email || sub.others?.email || '').trim() || null;
  const phone = (sub.others?.phone || '').trim() || null;
  const others = sub.others || {};

  // Découper le nom
  const parts = name.split(/\s+/);
  const firstName = sub.others?.first_name || parts[0] || name || 'Inconnu';
  const lastName = sub.others?.last_name || parts.slice(1).join(' ') || '';

  if (!email && !phone) return { status: 'skipped', detail: `${name}: ni email ni téléphone` };

  // Règle "un seul endroit" : employé/candidat gagne
  const emp = await findMatchingEmployee(prisma, email, phone);
  if (emp) return { status: 'linked', detail: `${name}: déjà Employé` };
  const cand = await findMatchingCandidate(prisma, email, phone);
  if (cand) return { status: 'linked', detail: `${name}: déjà Candidat` };

  // Déjà importé ? (idempotence)
  const existing = await prisma.prospectCandidate.findFirst({
    where: {
      OR: [
        { ghlSubmissionId: submissionId },
        email ? { email: { equals: email, mode: 'insensitive' } } : { id: '__none__' },
        phone ? { phone } : { id: '__none__' },
      ],
      isDeleted: false,
    },
  });

  // Télécharger CV + vidéo vers R2
  const cvRef = findCvFile(others);
  const videoRef = findVideoFile(others);

  let cvStoragePath: string | undefined;
  let videoStoragePath: string | undefined;
  let videoUploadedAt: Date | undefined;

  if (cvRef && !(existing?.cvStoragePath)) {
    try {
      const file = await downloadGhlFile(cvRef.url);
      if (file.buffer.length > 100) {
        const ext = detectExtension(file, cvRef.originalName);
        const key = `cvs/prospects/${submissionId}_${sanitize(firstName + '_' + lastName)}${ext}`;
        await uploadBufferToR2(file.buffer, key, file.contentType);
        cvStoragePath = key;
      }
    } catch (e: any) {
      logger.warn(`[survey-sync] CV échec ${name}: ${e.message}`);
    }
  }

  if (videoRef && !(existing?.videoStoragePath)) {
    try {
      const file = await downloadGhlFile(videoRef.url);
      // On s'assure que c'est RÉELLEMENT une vidéo (magic bytes), pas un
      // fichier renommé : sinon on ne la compte pas comme vidéo de présentation.
      if (file.buffer.length > 100 && isLikelyVideo(file.buffer)) {
        const ext = detectExtension(file, videoRef.originalName);
        const key = `videos/prospects/${submissionId}_${sanitize(firstName + '_' + lastName)}${ext}`;
        await uploadBufferToR2(file.buffer, key, file.contentType);
        videoStoragePath = key;
        videoUploadedAt = new Date();
      } else {
        logger.warn(`[survey-sync] fichier vidéo non valide (ignoré) pour ${name}`);
      }
    } catch (e: any) {
      logger.warn(`[survey-sync] vidéo échec ${name}: ${e.message}`);
    }
  }

  const answers = extractAnswers(others);
  const baseData: any = {
    firstName,
    lastName,
    email,
    phone: phone || '',
    city: others.city ? canonicalCity(others.city) : null, // normalise à la saisie
    streetAddress: others.address || null,
    province: others.state || 'QC',
    postalCode: others.postal_code || null,
    cvUrl: cvRef?.url || existing?.cvUrl || null,
    videoUrl: videoRef?.url || existing?.videoUrl || null,
    ghlSubmissionId: submissionId,
    surveyAnswers: answers,
    source: 'survey-video',
    submissionDate: existing?.submissionDate || new Date(),
  };
  if (cvStoragePath) baseData.cvStoragePath = cvStoragePath;
  if (videoStoragePath) { baseData.videoStoragePath = videoStoragePath; baseData.videoUploadedAt = videoUploadedAt; }

  if (existing) {
    await prisma.prospectCandidate.update({ where: { id: existing.id }, data: baseData });
    return { status: 'updated', detail: `${name}` };
  }
  await prisma.prospectCandidate.create({ data: baseData });
  return { status: 'created', detail: `${name}` };
}

/** Synchronise toute le survey (bouton manuel / backfill / cron). */
export async function syncSurvey(limit?: number): Promise<SyncSummary> {
  const summary: SyncSummary = {
    scanned: 0, created: 0, updated: 0, linkedExisting: 0, skippedNoContact: 0, errors: 0, details: [],
  };
  let submissions = await fetchAllSubmissions();
  if (limit && limit > 0) submissions = submissions.slice(0, limit);

  for (const sub of submissions) {
    summary.scanned++;
    try {
      const r = await syncOneSubmission(sub);
      if (r.status === 'created') summary.created++;
      else if (r.status === 'updated') summary.updated++;
      else if (r.status === 'linked') summary.linkedExisting++;
      else if (r.status === 'skipped') summary.skippedNoContact++;
    } catch (e: any) {
      summary.errors++;
      summary.details.push(`ERREUR ${sub?.name}: ${e.message}`);
      logger.error(`[survey-sync] ${sub?.id}: ${e.message}`);
    }
  }
  logger.info(`[survey-sync] ${JSON.stringify({ ...summary, details: undefined })}`);
  return summary;
}

/** Pour le webhook : retrouver la soumission la plus récente d'un contact. */
export async function findSubmissionByContact(email?: string | null, phone?: string | null): Promise<any | null> {
  const subs = await fetchAllSubmissions();
  const ne = (email || '').trim().toLowerCase();
  const np = (phone || '').replace(/\D/g, '').slice(-10);
  const matches = subs.filter((s) => {
    const se = (s.email || s.others?.email || '').trim().toLowerCase();
    const sp = (s.others?.phone || '').replace(/\D/g, '').slice(-10);
    return (ne && se === ne) || (np && np.length === 10 && sp === np);
  });
  if (!matches.length) return null;
  // la plus récente (les submissions sont triées desc côté GHL ; on prend la 1re)
  return matches[0];
}
