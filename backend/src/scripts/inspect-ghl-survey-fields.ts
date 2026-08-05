/**
 * Inspecte les réponses brutes du survey GoHighLevel — LECTURE SEULE.
 *
 * Sert à retrouver le code de la question « Disponibilités » du formulaire
 * « Renseignements étudiants » et, surtout, la FORME exacte de sa valeur
 * (tableau ? chaîne jointe par des virgules ? objet ?).
 *
 * À noter : le décodage des disponibilités ne dépend PAS de ce code — il repère
 * la réponse par sa valeur, parce que survey-sync.service.ts documente que
 * « les IDs de champs du survey ne sont PAS constants entre soumissions ».
 * Ce script sert donc au diagnostic et à ajouter un libellé lisible dans
 * `FIELD_LABELS` (aujourd'hui les codes s'affichent bruts sur la fiche prospect).
 *
 * N'utilisez PAS `src/scripts/archive/list-custom-fields.ts` : il lit des
 * variables d'environnement mortes (GOHIGHLEVEL_API_KEY) et interroge les
 * champs personnalisés de la LOCATION, qui ne partagent pas l'espace de noms
 * des questions de survey.
 *
 * Lancer (depuis backend/) :
 *   npx ts-node src/scripts/inspect-ghl-survey-fields.ts
 *   npx ts-node src/scripts/inspect-ghl-survey-fields.ts --limit=20
 *   # ou
 *   npm run inspect:ghl-fields
 */
import { getGhlLocationId, ghlRequest } from '../services/ghl.client';
import { parseGhlAvailability } from '../utils/availability';
import logger from '../config/logger';

const SURVEY_ID = process.env.GHL_SURVEY_ID || '7R37monCgHPJyTiinjn3';

const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 20;

// Mêmes clés techniques que `extractAnswers` (survey-sync.service.ts).
const TECH = new Set([
  'eventData', 'sessionId', 'sessionFingerprint', 'formId', 'location_id',
  'fieldsOriSequance', 'submissionId', 'signatureHash', 'ip', 'Timezone',
]);

interface FieldStat {
  count: number;
  shapes: Set<string>;
  samples: Set<string>;
  looksLikeAvailability: boolean;
}

async function main() {
  const data = await ghlRequest<any>('/surveys/submissions', {
    query: { locationId: getGhlLocationId(), surveyId: SURVEY_ID, limit: LIMIT, page: 1 },
  });
  const submissions: any[] = data.submissions || [];
  logger.info(`${submissions.length} soumission(s) analysée(s) (survey ${SURVEY_ID}).`);

  const stats = new Map<string, FieldStat>();

  for (const sub of submissions) {
    for (const [key, value] of Object.entries(sub.others || {})) {
      if (TECH.has(key)) continue;
      const stat = stats.get(key) || {
        count: 0,
        shapes: new Set<string>(),
        samples: new Set<string>(),
        looksLikeAvailability: false,
      };
      stat.count++;
      stat.shapes.add(Array.isArray(value) ? 'array' : typeof value);
      if (stat.samples.size < 8) stat.samples.add(JSON.stringify(value)?.slice(0, 120) ?? 'null');
      if (parseGhlAvailability(value)) stat.looksLikeAvailability = true;
      stats.set(key, stat);
    }
  }

  const rows = [...stats.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [key, s] of rows) {
    const flag = s.looksLikeAvailability ? '  ⬅ RESSEMBLE À DES DISPONIBILITÉS' : '';
    logger.info(`\n📌 ${key}${flag}`);
    logger.info(`   occurrences : ${s.count} · formes : ${[...s.shapes].join(', ')}`);
    for (const sample of s.samples) logger.info(`   ex. ${sample}`);
  }

  const candidates = rows.filter(([k, s]) => s.looksLikeAvailability || k.toLowerCase().includes('dispo'));
  if (candidates.length === 0) {
    logger.warn('\n⚠️  Aucun champ ne ressemble à des disponibilités dans cet échantillon.');
    logger.warn('   Augmentez --limit, ou le formulaire n\'a pas encore reçu de soumission.');
  } else {
    logger.info(`\n✅ Candidat(s) retenu(s) : ${candidates.map(([k]) => k).join(', ')}`);
    logger.info('   Ajoutez-les à FIELD_LABELS (survey-sync.service.ts) pour un libellé lisible.');
  }
}

main()
  .catch((e) => {
    logger.error('Inspection des champs GHL échouée', e);
    process.exit(1);
  });
