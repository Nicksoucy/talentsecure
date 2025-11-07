import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function makeTestAdmin() {
  try {
    console.log('🔧 Mise à jour du rôle pour test@xguard.com...\n');

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: 'test@xguard.com' },
    });

    if (!user) {
      console.log('❌ Utilisateur test@xguard.com non trouvé');
      console.log('💡 Créez d\'abord un compte avec cet email\n');
      return;
    }

    console.log(`📧 Utilisateur trouvé: ${user.email}`);
    console.log(`👤 Rôle actuel: ${user.role}\n`);

    // Update to ADMIN
    const updated = await prisma.user.update({
      where: { email: 'test@xguard.com' },
      data: { role: 'ADMIN' },
    });

    console.log('✅ Rôle mis à jour avec succès!');
    console.log(`👤 Nouveau rôle: ${updated.role}\n`);
  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

makeTestAdmin();
