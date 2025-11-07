import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createSystemUser() {
  try {
    console.log('🔧 Création de l\'utilisateur système...\n');

    const hashedPassword = await bcrypt.hash('SystemImport123!', 10);

    const user = await prisma.user.upsert({
      where: { email: 'system@talentsecure.com' },
      update: {},
      create: {
        email: 'system@talentsecure.com',
        password: hashedPassword,
        firstName: 'System',
        lastName: 'Import',
        role: 'ADMIN',
        isActive: true,
      },
    });

    console.log('✅ Utilisateur système créé!');
    console.log('ID:', user.id);
    console.log('Email:', user.email);
    console.log('\n');
  } catch (error) {
    console.error('❌ Erreur:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createSystemUser();
