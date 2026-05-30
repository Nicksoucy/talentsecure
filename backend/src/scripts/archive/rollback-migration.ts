import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const migrationName = '20251202184500_add_indexes';
    console.log(`Deleting migration record for ${migrationName}...`);
    try {
        const result = await prisma.$executeRawUnsafe(`DELETE FROM "_prisma_migrations" WHERE migration_name = '${migrationName}'`);
        console.log(`Deleted ${result} rows.`);
    } catch (e) {
        console.error('Error deleting row:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
