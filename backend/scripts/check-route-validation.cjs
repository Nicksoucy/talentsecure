#!/usr/bin/env node
/**
 * Garde d'architecture (P2-A) : échoue si une route MUTANTE (POST/PUT/PATCH)
 * n'a pas de validation de body (`validate({ body })` ou `validateRequest`),
 * SAUF si elle figure dans l'allowlist de dette ci-dessous.
 *
 * But : empêcher toute NOUVELLE route mutante non validée, et faire fondre la
 * dette existante au fil des PR (retirer des entrées de l'allowlist au fur et
 * à mesure qu'on ajoute les schémas).
 *
 * Les routes d'upload multipart (multer .single/.array/.fields) sont exclues :
 * leur body n'est pas du JSON validable par Zod de la même façon.
 *
 * Usage : node scripts/check-route-validation.cjs [--report]
 *   --report : liste toute la dette sans faire échouer (diagnostic).
 */
const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '..', 'src', 'routes');
const MUTATING = ['post', 'put', 'patch'];

// Dette connue : routes mutantes encore sans validation de body.
// Clé = `${fichier} ${METHOD} ${chemin}`. À VIDER au fil des PR (P2-A).
// Beaucoup sont des transitions d'état SANS body (finalize/cancel/archive/
// mark-all-read…) ou des webhooks validés par SIGNATURE (pas par Zod).
const ALLOWLIST = new Set([
  'admin.routes.ts POST /revert-auto-converted-candidates',
  'admin.routes.ts POST /revert-candidate-to-prospect/:id',
  'admin.routes.ts POST /revert-batch-candidates-to-prospects',
  'auth.routes.ts POST /refresh',
  'auth.routes.ts POST /logout',
  'candidate.routes.ts POST /:id/cv',
  'candidate.routes.ts PATCH /:id/archive',
  'candidate.routes.ts PATCH /:id/unarchive',
  'catalogue.routes.ts POST /:id/generate',
  'catalogue.routes.ts POST /:id/share',
  'client.routes.ts POST /:id/reactivate',
  'employee.routes.ts POST /promote/:candidateId',
  'employee.routes.ts POST /promote-prospect/:prospectId',
  'extraction.routes.ts POST /candidates/:id/extract',
  'extraction.routes.ts POST /prospects/:id/extract',
  'notification.routes.ts POST /internal/dispatch',
  'notification.routes.ts POST /mark-all-read',
  'notification.routes.ts POST /:id/read',
  'prospect.routes.ts POST /sync-survey',
  'prospect.routes.ts POST /:id/refresh-video-from-ghl',
  'prospect.routes.ts POST /:id/contact',
  'prospect.routes.ts POST /:id/convert',
  'talent-marketplace.routes.ts POST /talents/:id/checkout',
  'uniform.routes.ts POST /sign/:token',
  'uniform.routes.ts POST /issuances/draft',
  'uniform.routes.ts POST /labels',
  'uniform.routes.ts PUT /variants/:variantId',
  'uniform.routes.ts POST /items/reorder',
  'uniform.routes.ts PUT /items/:id',
  'uniform.routes.ts POST /items/:id/variants/reorder',
  'uniform.routes.ts PUT /issuances/:id',
  'uniform.routes.ts POST /issuances/:id/finalize',
  'uniform.routes.ts POST /issuances/:id/send-sms',
  'uniform.routes.ts POST /issuances/:id/counter-sign',
  'uniform.routes.ts POST /issuances/:id/cancel',
  'uniform.routes.ts POST /issuances/:id/close-termination',
  'uniform.routes.ts POST /returns/:id/finalize',
  'uniform.routes.ts POST /returns/:id/send-sms',
  'uniform.routes.ts POST /returns/:id/counter-sign',
  'uniform.routes.ts POST /wash-batches',
  'uniform.routes.ts POST /wash-batches/:id/items',
  'uniform.routes.ts POST /wash-batches/:id/send',
  'uniform.routes.ts POST /wash-batches/:id/return',
  'uniform.routes.ts POST /wash-batches/:id/inspect',
  'uniform.routes.ts POST /wash-batches/:id/inspect-all-good',
  'uniform.routes.ts POST /wash-batches/:id/cancel',
  'webhook.routes.ts POST /gohighlevel/prospect',
  'webhook.routes.ts POST /gohighlevel/survey-prospect',
  'wishlist.routes.ts POST /submit',
]);

/** Renvoie la sous-chaîne équilibrée à partir de l'index de la '(' ouvrante,
 *  en ignorant les parenthèses dans les chaînes et commentaires. */
function balancedCall(text, openIdx) {
  let depth = 0;
  let i = openIdx;
  let str = null; // quote char en cours
  let line = false;
  let block = false;
  for (; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (str) {
      if (c === '\\') { i++; continue; }
      if (c === str) str = null;
      continue;
    }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return text.slice(openIdx, i + 1); }
  }
  return text.slice(openIdx); // non équilibré (ne devrait pas arriver)
}

/** Premier littéral de chaîne dans une portion d'args (= le chemin de route). */
function firstStringLiteral(s) {
  const m = s.match(/(['"`])((?:\\.|(?!\1).)*)\1/);
  return m ? m[2] : '(inconnu)';
}

const isUpload = (call) => /\.(single|array|fields)\s*\(|Upload\b/.test(call);

/** Validation de BODY spécifiquement : `validateRequest(...)` (body par défaut)
 *  ou `validate({ ... body: ... })`. Une route qui ne valide QUE les params ne
 *  compte donc PAS comme validée. */
function hasBodyValidation(call) {
  if (/\bvalidateRequest\s*\(/.test(call)) return true;
  let idx = call.indexOf('validate(');
  while (idx !== -1) {
    const args = balancedCall(call, call.indexOf('(', idx));
    const inner = args.slice(1, -1).trim(); // contenu entre les parenthèses
    if (inner.startsWith('{')) {
      // littéral d'objet → doit contenir une clé `body:`
      if (/\bbody\s*:/.test(inner)) return true;
    } else if (inner.length) {
      // schéma passé par variable, ex. `validate(createSkillSchema)` (= { body }) →
      // on suppose qu'il valide le body (impossible de résoudre la variable ici).
      return true;
    }
    idx = call.indexOf('validate(', idx + 'validate('.length);
  }
  return false;
}

const report = process.argv.includes('--report');
const files = fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.routes.ts'));

const violations = [];
const debt = [];
const usedAllow = new Set();

for (const file of files) {
  const text = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
  const re = /router\s*\.\s*(post|put|patch|get|delete)\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const method = m[1].toLowerCase();
    if (!MUTATING.includes(method)) continue;
    const openIdx = m.index + m[0].length - 1;
    const call = balancedCall(text, openIdx);
    const routePath = firstStringLiteral(call);
    if (isUpload(call)) continue; // multipart : hors périmètre body-JSON
    if (hasBodyValidation(call)) continue;
    const key = `${file} ${method.toUpperCase()} ${routePath}`;
    debt.push(key);
    if (ALLOWLIST.has(key)) { usedAllow.add(key); continue; }
    violations.push(key);
  }
}

if (report) {
  console.log(`Routes mutantes SANS validation (${debt.length}) :`);
  for (const d of debt) console.log('  - ' + d);
  process.exit(0);
}

// Allowlist périmée (entrée désormais validée ou disparue) → à nettoyer.
const stale = [...ALLOWLIST].filter((k) => !usedAllow.has(k));
if (stale.length) {
  console.error('Entrées d\'allowlist PÉRIMÉES (route désormais validée/supprimée) — à retirer :');
  for (const s of stale) console.error('  - ' + s);
}

if (violations.length) {
  console.error(`\n✖ ${violations.length} route(s) mutante(s) sans validation de body (et hors allowlist) :`);
  for (const v of violations) console.error('  - ' + v);
  console.error('\nAjoute un `validate({ body: <schema> })` (cf. src/validation/) ou, en dernier recours, ajoute la clé à ALLOWLIST dans ce script.');
  process.exit(1);
}

if (stale.length) process.exit(1);
console.log(`✓ Toutes les routes mutantes hors allowlist sont validées. Dette restante : ${ALLOWLIST.size}.`);
