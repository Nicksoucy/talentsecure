import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const MODELS = [
    'user',
    'candidate',
    'prospectCandidate',
    'client',
    'catalogue',
    'catalogueItem',
    'catalogueSelection',
    'placement',
    'skill',
    'candidateSkill',
    'job',
    'availability',
    'language',
    'experience',
    'certification',
    'situationTest',
    'auditLog',
    'clientPurchase',
    'cataloguePayment',
    'wishlist',
    'wishlistItem'
];

async function backup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '../../backups', timestamp);

    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    console.log(`📦 Starting backup to ${backupDir}...`);

    for (const modelName of MODELS) {
        try {
            // @ts-ignore - Dynamic access to prisma models
            if (!prisma[modelName]) {
                console.warn(`⚠️ Model ${modelName} not found in Prisma Client, skipping.`);
                continue;
            }

            // @ts-ignore
            const count = await prisma[modelName].count();
            console.log(`   Exporting ${modelName} (${count} records)...`);

            // @ts-ignore
            const data = await prisma[modelName].findMany();

            const filePath = path.join(backupDir, `${modelName}.json`);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error(`❌ Error backing up ${modelName}:`, error);
        }
    }

    console.log('✅ Backup completed successfully!');
}

backup()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
