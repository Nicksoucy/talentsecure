#!/usr/bin/env node
/**
 * GARDE-FOU ANTI-CATASTROPHE pour `npm run test:db:push`.
 *
 * `prisma db push --force-reset` DÉTRUIT la base ciblée. Prisma charge
 * silencieusement backend/.env (qui pointe sur Neon PROD) quand DATABASE_URL
 * n'est pas exportée dans le shell — c'est exactement l'accident du 2026-07-17
 * (base de prod vidée, restaurée via l'historique Neon).
 *
 * Ici on reproduit la règle du garde-fou des tests (src/__tests__/setup.ts) :
 * l'URL EFFECTIVE que Prisma verra (env du shell, sinon .env) doit RESSEMBLER
 * à une base de test (localhost / 127.0.0.1 / *_test), sinon on refuse.
 */
const fs = require('fs');
const path = require('path');

const isTestDbUrl = (u) => /localhost|127\.0\.0\.1|_test\b|talentsecure_test/.test(u);

function envFileDatabaseUrl() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const m = raw.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?\s*$/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// Même précédence que Prisma : variable du shell d'abord, sinon .env.
const effective = process.env.DATABASE_URL || envFileDatabaseUrl();

if (!effective) {
  console.error('assert-test-db: aucune DATABASE_URL trouvée (shell ni .env) — rien à réinitialiser.');
  process.exit(1);
}

if (!isTestDbUrl(effective)) {
  const redacted = effective.replace(/:\/\/[^@]*@/, '://***@');
  console.error(
    '\n⛔ SÉCURITÉ — test:db:push REFUSÉ.\n' +
      `L'URL que Prisma utiliserait ne ressemble PAS à une base de test :\n  ${redacted}\n` +
      '`prisma db push --force-reset` DÉTRUIRAIT cette base (backend/.env pointe sur la prod Neon).\n\n' +
      'Utilisation correcte (base de test locale) :\n' +
      '  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talentsecure_test" npm run test:db:push\n'
  );
  process.exit(1);
}

console.log('assert-test-db: OK — base de test détectée.');
