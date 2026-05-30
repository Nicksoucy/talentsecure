import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function checkAdmin() {
    const email = 'admin@xguard.ca';
    const password = 'Admin123!';

    console.log(`🔍 Checking user: ${email}`);

    const user = await prisma.user.findUnique({
        where: { email },
    });

    if (!user) {
        console.log('❌ User not found in database!');
        return;
    }

    console.log('✅ User found:', user.id, user.role);

    // Check password
    if (user.password) {
        const isValid = await bcrypt.compare(password, user.password);
        console.log(`🔑 Password check: ${isValid ? 'VALID' : 'INVALID'}`);

        if (!isValid) {
            console.log('⚠️ Password mismatch. Resetting password...');
            const hashedPassword = await bcrypt.hash(password, 10);
            await prisma.user.update({
                where: { id: user.id },
                data: { password: hashedPassword },
            });
            console.log('✅ Password reset successfully to: Admin123!');
        }
    } else {
        console.log('⚠️ User has no password (OAuth only?)');
    }
}

checkAdmin()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
