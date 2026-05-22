/**
 * Synchronise le survey vidéo GHL (CV + vidéo + réponses → R2 → prospects).
 *
 *   npx ts-node src/scripts/sync-survey.ts            (toutes les soumissions)
 *   npx ts-node src/scripts/sync-survey.ts --limit=5  (échantillon)
 */
import { syncSurvey } from '../services/survey-sync.service';

const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

syncSurvey(limit)
  .then((s) => {
    console.log('\n=== SYNC SURVEY ===');
    console.log(`Scannées        : ${s.scanned}`);
    console.log(`Créées          : ${s.created}`);
    console.log(`Mises à jour    : ${s.updated}`);
    console.log(`Déjà empl/cand  : ${s.linkedExisting}`);
    console.log(`Sans contact    : ${s.skippedNoContact}`);
    console.log(`Erreurs         : ${s.errors}`);
    if (s.details.length) console.log('Détails:\n  ' + s.details.join('\n  '));
    process.exit(0);
  })
  .catch((e) => {
    console.error('Erreur fatale:', e);
    process.exit(1);
  });
