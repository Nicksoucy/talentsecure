import { PrismaClient } from '@prisma/client';

// Variables d'environnement pour les tests.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-for-testing-only';
// Les jobs cron ne doivent jamais démarrer en test.
process.env.DISABLE_SCHEDULER = 'true';

// Base de TEST — garde-fou anti-catastrophe.
// On n'accepte qu'une URL qui RESSEMBLE à une base de test (localhost/_test).
// - DATABASE_URL absente  → défaut local *_test.
// - DATABASE_URL présente mais ressemblant à la prod (ex. backend/.env Neon
//   chargé dans le shell) → on REFUSE de lancer les tests, pour ne JAMAIS
//   toucher une base réelle.
const TEST_DB_DEFAULT = 'postgresql://postgres:postgres@localhost:5432/talentsecure_test';
const isTestDbUrl = (u: string): boolean => /localhost|127\.0\.0\.1|_test\b|talentsecure_test/.test(u);

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = TEST_DB_DEFAULT;
} else if (!isTestDbUrl(process.env.DATABASE_URL)) {
  const redacted = process.env.DATABASE_URL.replace(/:\/\/[^@]*@/, '://***@');
  throw new Error(
    `SÉCURITÉ: DATABASE_URL ne ressemble pas à une base de test (${redacted}). ` +
    'Les tests sont refusés pour ne jamais toucher une base réelle. Utilisez une base *_test.'
  );
}

// Singleton Prisma pour les tests (lit DATABASE_URL fixée ci-dessus).
export const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Vide toutes les tables applicatives entre les tests.
 *
 * Implémentation robuste : `TRUNCATE … RESTART IDENTITY CASCADE` sur TOUTES les
 * tables du schéma `public` en une seule instruction. CASCADE ignore l'ordre des
 * clés étrangères, et lister dynamiquement les tables inclut automatiquement
 * toute nouvelle table (candidate_videos, uniformes, etc.) sans maintenance.
 * La table interne `_prisma_migrations` est épargnée.
 */
export async function cleanDatabase(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL || '';
  if (!isTestDbUrl(dbUrl)) {
    throw new Error(
      'REFUS: DATABASE_URL ne ressemble pas à une base de test (localhost/_test). ' +
      'cleanDatabase() effacerait des données réelles.'
    );
  }

  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length === 0) return;

  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
