/**
 * Validateur de variables d'environnement critiques.
 *
 * Doit être importé EN PREMIER dans server.ts (avant tout autre import de l'app)
 * pour fail-fast au boot si un secret est absent. Cela évite que l'app démarre
 * avec un secret par défaut connu (faille critique).
 */

import dotenv from 'dotenv';

dotenv.config();

const REQUIRED_VARS = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'] as const;

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
