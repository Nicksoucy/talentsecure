#!/usr/bin/env node
/**
 * Hook PreToolUse (Bash) — garde anti-prod, post-mortem incident 2026-07-17.
 *
 * Bloque toute commande de reset Prisma (`--force-reset`, `migrate reset`)
 * qui ne cible pas EXPLICITEMENT une base de test (talentsecure_test /
 * localhost / 127.0.0.1 dans la commande). Sans URL inline, Prisma chargerait
 * silencieusement backend/.env → Neon PROD. Deuxième couche indépendante du
 * garde applicatif backend/scripts/assert-test-db.cjs.
 */
let s = '';
process.stdin.on('data', (d) => (s += d)).on('end', () => {
  let cmd = '';
  try {
    cmd = (JSON.parse(s).tool_input || {}).command || '';
  } catch {
    /* payload illisible → on n'interfère pas */
  }
  const dangerous = /--force-reset|migrate\s+reset/.test(cmd);
  const testDb = /talentsecure_test|localhost|127\.0\.0\.1/.test(cmd);
  if (dangerous && !testDb) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            'BLOQUÉ (garde anti-prod, incident 2026-07-17) : reset Prisma sans DATABASE_URL de test explicite. ' +
            'Préfixer par DATABASE_URL=postgresql://postgres:postgres@localhost:5432/talentsecure_test',
        },
      })
    );
  }
});
