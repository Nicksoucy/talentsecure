import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetAdminPassword() {
    const email = 'admin@xguard.ca';
    const password = 'Admin123!';

    console.log('🔄 Recherche de l\'utilisateur admin...');

    // Check if admin exists
    let admin = await prisma.user.findUnique({
        where: { email },
    });

    const hashedPassword = await bcrypt.hash(password, 10);

    if (admin) {
        // Update existing admin
        await prisma.user.update({
            where: { email },
            data: {
                password: hashedPassword,
                role: 'ADMIN',
                isActive: true,
            },
        });
        console.log('✅ Mot de passe admin réinitialisé avec succès!');
    } else {
        // Create new admin
        admin = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                firstName: 'Admin',
                lastName: 'XGUARD',
                role: 'ADMIN',
                isActive: true,
            },
        });
        console.log('✅ Utilisateur admin créé avec succès!');
    }

    console.log('\n📧 Email:', email);
    console.log('🔑 Mot de passe:', password);
    console.log('\n⚠️  Changez ce mot de passe après la première connexion!\n');

    await prisma.$disconnect();
}

resetAdminPassword()
    .catch((error) => {
        console.error('❌ Erreur:', error);
        process.exit(1);
    });
