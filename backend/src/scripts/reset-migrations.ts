import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Deleting all rows from _prisma_migrations...');
    try {
        await prisma.$executeRawUnsafe(`DELETE FROM "_prisma_migrations"`);
        console.log('Successfully deleted all rows.');
    } catch (e) {
        console.error('Error deleting rows:', e);
        // If the table doesn't exist, that's fine too, but it should exist.
    } finally {
        await prisma.$disconnect();
    }
}

main();
