import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    console.log('👤 Création de l\'utilisateur de test...\n');

    const hashedPassword = await bcrypt.hash('Test123!', 10);

    const user = await prisma.user.upsert({
      where: { email: 'test@xguard.com' },
      update: {
        password: hashedPassword,
        isActive: true,
      },
      create: {
        email: 'test@xguard.com',
        password: hashedPassword,
        firstName: 'Test',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
      },
    });

    console.log('✅ Utilisateur de test créé/mis à jour!');
    console.log('\nInformations de connexion:');
    console.log('  Email: test@xguard.com');
    console.log('  Mot de passe: Test123!');
    console.log('  Rôle:', user.role);
    console.log('\n');
  } catch (error) {
    console.error('❌ Erreur:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();
