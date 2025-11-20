const { PrismaClient } = require('@prisma/client');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-testing-only';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/talentsecure_test';

const prisma = new PrismaClient();

global.__TEST_PRISMA__ = prisma;

afterAll(async () => {
  await prisma.$disconnect();
});
