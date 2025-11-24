import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../utils/password';

const prisma = new PrismaClient();

async function createAdminUser() {
    try {
        // Check if admin already exists
        const existingAdmin = await prisma.user.findUnique({
            where: { email: 'admin@xguard.ca' },
        });

        if (existingAdmin) {
            console.log('✅ Admin user already exists');
            return;
        }

        // Create admin user
        const hashedPassword = await hashPassword('Admin123!');

        const admin = await prisma.user.create({
            data: {
                email: 'admin@xguard.ca',
                password: hashedPassword,
                firstName: 'Admin',
                lastName: 'XGUARD',
                role: 'ADMIN',
                isActive: true,
            },
        });

        console.log('✅ Admin user created successfully:');
        console.log(`   Email: ${admin.email}`);
        console.log(`   Password: Admin123!`);
        console.log(`   Role: ${admin.role}`);
    } catch (error) {
        console.error('❌ Error creating admin user:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

createAdminUser();
