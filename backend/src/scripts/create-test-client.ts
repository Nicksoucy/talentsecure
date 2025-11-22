import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const email = 'testclient@example.com';
    const password = 'password123';
    const hashedPassword = await bcrypt.hash(password, 10);

    const client = await prisma.client.upsert({
        where: { email },
        update: {
            password: hashedPassword,
        },
        create: {
            name: 'Test Client',
            companyName: 'Test Corp',
            email,
            password: hashedPassword,
        },
    });

    console.log(`Client created/updated: ${client.email} / ${password}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
