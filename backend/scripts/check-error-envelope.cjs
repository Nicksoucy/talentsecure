#!/usr/bin/env node
/**
 * Garde d'architecture (P2-B) : plafond ratchet sur les réponses d'erreur AD HOC
 * `res.json({ error: ... })` dans les controllers.
 *
 * Objectif : tout faire passer par `throw new ApiError(status, message, code)` +
 * le handler global (enveloppe unique `{ success, code, message, details?, requestId }`).
 * Aucune NOUVELLE réponse `{error}` inline n'est permise ; on BAISSE `BASELINE`
 * au fil des migrations jusqu'à 0.
 *
 * Usage : node scripts/check-error-envelope.cjs [--report]
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'src', 'controllers');
// Plafond courant — À BAISSER à chaque migration de controller vers ApiError.
// Départ 181 ; employee.controller migré (-5) → 176.
const BASELINE = 176;

const re = /\.json\(\s*\{\s*error\b/g;

let count = 0;
const per = {};
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.ts'))) {
  const t = fs.readFileSync(path.join(DIR, f), 'utf8');
  const m = t.match(re);
  if (m) { count += m.length; per[f] = m.length; }
}

if (process.argv.includes('--report')) {
  Object.entries(per).sort((a, b) => b[1] - a[1]).forEach(([f, c]) => console.log(`  ${c}\t${f}`));
  console.log(`total ${count}`);
  process.exit(0);
}

if (count > BASELINE) {
  console.error(`✖ ${count} réponses d'erreur ad hoc \`res.json({ error })\` — au-dessus du plafond ${BASELINE}.`);
  console.error('Utilise `throw new ApiError(status, message, code)` (formaté par le handler global) au lieu d\'une réponse {error} inline.');
  process.exit(1);
}
if (count < BASELINE) {
  console.error(`ℹ ${count} < plafond ${BASELINE} : pense à BAISSER BASELINE à ${count} dans ce script (ratchet).`);
  process.exit(1);
}
console.log(`✓ Réponses {error} inline : ${count} ≤ plafond ${BASELINE} (objectif : 0).`);
