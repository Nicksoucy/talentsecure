import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Initialize Prisma with the environment variable provided
const prisma = new PrismaClient();

async function resetAdmin() {
    const email = 'admin@xguard.ca';
    const password = 'Admin123!';

    console.log(`🔍 Connecting to database...`);
    console.log(`🔍 Checking user: ${email}`);

    try {
        const user = await prisma.user.findUnique({
            where: { email },
        });

        const hashedPassword = await bcrypt.hash(password, 10);

        if (!user) {
            console.log('❌ User not found. Creating it...');
            await prisma.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    firstName: 'Admin',
                    lastName: 'XGUARD',
                    role: 'ADMIN',
                    isActive: true,
                },
            });
            console.log('✅ Admin user created successfully!');
        } else {
            console.log('✅ User found. Resetting password...');
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    password: hashedPassword,
                    isActive: true, // Ensure account is active
                    role: 'ADMIN'   // Ensure role is ADMIN
                },
            });
            console.log('✅ Admin password reset successfully!');
        }
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

resetAdmin();
