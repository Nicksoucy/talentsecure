
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password';

const prisma = new PrismaClient();

async function seedAdmin() {
    try {
        const email = 'admin@xguard.ca';
        const existingUser = await prisma.user.findUnique({ where: { email } });

        if (existingUser) {
            console.log(`User ${email} already exists.`);
            return;
        }

        const hashedPassword = await hashPassword('Admin123!');

        const user = await prisma.user.create({
            data: {
                firstName: 'Admin',
                lastName: 'XGUARD',
                email,
                password: hashedPassword,
                role: 'ADMIN',
                isActive: true,
            },
        });

        console.log('Admin user created successfully:', user.email);
    } catch (error) {
        console.error('Error creating admin user:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

seedAdmin();
