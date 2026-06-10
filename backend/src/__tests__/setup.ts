import { PrismaClient } from '@prisma/client';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-testing-only';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/talentsecure_test';

// Create a singleton Prisma client for tests
export const prisma = new PrismaClient();

// Cleanup function to run after all tests
afterAll(async () => {
  await prisma.$disconnect();
});

// Helper to clean up database between tests
export async function cleanDatabase() {
  // D1 (audit) — garde-fou anti-catastrophe : ces deleteMany sont MASSIFS. Si
  // DATABASE_URL ne ressemble pas à une base de test (ex. Neon prod exportée dans
  // le shell), on REFUSE d'effacer quoi que ce soit. Placé ICI (et non au chargement
  // du module) pour ne pas casser les tests qui ne touchent pas la BD.
  const dbUrl = process.env.DATABASE_URL || '';
  if (!/localhost|127\.0\.0\.1|_test\b|talentsecure_test/.test(dbUrl)) {
    throw new Error(
      'REFUS: DATABASE_URL ne ressemble pas à une base de test (localhost/_test). ' +
      'cleanDatabase() effacerait des données réelles. Utilisez une base de test dédiée.'
    );
  }

  // Delete in correct order to respect foreign key constraints
  // First delete all child tables that reference other tables
  await prisma.catalogueItem.deleteMany();
  await prisma.catalogueSelection.deleteMany();
  await prisma.cataloguePayment.deleteMany();
  await prisma.placement.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.language.deleteMany();
  await prisma.experience.deleteMany();
  await prisma.certification.deleteMany();
  await prisma.situationTest.deleteMany();
  await prisma.candidateSkill.deleteMany();
  await prisma.prospectSkill.deleteMany();
  await prisma.wishlistItem.deleteMany();
  await prisma.clientWishlist.deleteMany();
  await prisma.clientPurchase.deleteMany();

  // Then delete parent tables
  await prisma.candidate.deleteMany();
  await prisma.prospectCandidate.deleteMany();
  await prisma.catalogue.deleteMany();
  await prisma.client.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
}
