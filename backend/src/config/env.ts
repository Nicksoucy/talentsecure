/**
 * Validateur de variables d'environnement critiques.
 *
 * Doit être importé EN PREMIER dans server.ts (avant tout autre import de l'app)
 * pour fail-fast au boot si un secret est absent. Cela évite que l'app démarre
 * avec un secret par défaut connu (faille critique).
 */

import dotenv from 'dotenv';

// En test, on ne charge PAS le .env du projet : les variables sont fournies
// explicitement par le harness (src/__tests__/setup.ts). Cela isole les tests du
// .env réel (jamais de secrets/Neon prod chargés par mégarde) et permet à
// env.test.ts de vérifier le comportement « variable manquante » sans que dotenv
// ne les recharge.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

const REQUIRED_VARS = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'] as const;

// Variables sans lesquelles l'app démarre, mais dont l'absence casse une
// fonctionnalité entière au premier appel. Volontairement NON bloquantes : un
// dev local sans credentials GHL doit pouvoir lancer l'app et la suite de tests.
// Les modules concernés (services/ghl.client.ts) lèvent au moment de l'appel.
const RECOMMENDED_VARS = [
  ['GHL_PIT_TOKEN', 'intégration GoHighLevel (survey, SMS, courriels, vidéos candidats)'],
  ['GHL_LOCATION_ID', 'intégration GoHighLevel (sous-compte ciblé)'],
] as const;

const FORBIDDEN_VALUES = new Set([
  'your-secret-key',
  'change-this',
  'change-me',
  'secret',
  'password',
  'jwt-secret',
]);

const missing: string[] = [];
const insecure: string[] = [];

for (const name of REQUIRED_VARS) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    missing.push(name);
    continue;
  }
  if (FORBIDDEN_VALUES.has(value.toLowerCase())) {
    insecure.push(`${name} utilise une valeur par défaut interdite`);
  }
  if ((name === 'JWT_SECRET' || name === 'JWT_REFRESH_SECRET') && value.length < 32) {
    insecure.push(`${name} doit faire au moins 32 caractères (actuellement ${value.length})`);
  }
}

if (missing.length > 0 || insecure.length > 0) {
  const errors: string[] = [];
  if (missing.length > 0) {
    errors.push(`Variables d'environnement requises manquantes: ${missing.join(', ')}`);
  }
  errors.push(...insecure);
  console.error('\n❌ Configuration invalide — démarrage refusé\n');
  for (const err of errors) {
    console.error(`  • ${err}`);
  }
  console.error('\nVérifiez votre fichier .env (ou les variables Cloud Run en production).\n');
  throw new Error('Configuration env invalide: ' + errors.join(' | '));
}

if (process.env.NODE_ENV !== 'test') {
  for (const [name, feature] of RECOMMENDED_VARS) {
    if (!process.env[name]?.trim()) {
      console.warn(`⚠️  ${name} absent — ${feature} indisponible.`);
    }
  }
}
