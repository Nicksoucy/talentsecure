import crypto from 'crypto';

/**
 * Generate secure random secrets for production
 */
function generateSecret(length: number = 64): string {
  return crypto.randomBytes(length).toString('base64url');
}

console.log('\n🔐 SECRETS POUR PRODUCTION\n');
console.log('=' .repeat(80));
console.log('\nCopiez ces valeurs dans vos variables d\'environnement:\n');
console.log('=' .repeat(80));
console.log('\n# JWT Configuration');
console.log(`JWT_SECRET=${generateSecret(64)}`);
console.log(`JWT_REFRESH_SECRET=${generateSecret(64)}`);
console.log(`\n# Session Configuration`);
console.log(`SESSION_SECRET=${generateSecret(48)}`);
console.log('\n' + '=' .repeat(80));
console.log('\n⚠️  IMPORTANT:');
console.log('  - NE JAMAIS commiter ces secrets dans Git');
console.log('  - Gardez ces secrets en lieu sûr (password manager)');
console.log('  - Utilisez ces secrets UNIQUEMENT en production');
console.log('  - Générez de nouveaux secrets pour chaque environnement\n');
console.log('=' .repeat(80) + '\n');
