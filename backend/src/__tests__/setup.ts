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
  // Delete in correct order to respect foreign key constraints
  await prisma.interviewEvaluation.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.client.deleteMany();
  await prisma.catalogue.deleteMany();
  await prisma.user.deleteMany();
}
