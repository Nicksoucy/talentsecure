import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Graceful shutdown handler
 * Ensures database connections are properly closed
 */
export async function disconnectDatabase() {
  await prisma.$disconnect();
}

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await disconnectDatabase();
});

// O4 (audit) — SIGINT/SIGTERM sont désormais gérés dans server.ts (arrêt
// gracieux : on draine le serveur HTTP AVANT de fermer Prisma). On garde
// `beforeExit` comme filet et on exporte disconnectDatabase pour server.ts.

export default prisma;
