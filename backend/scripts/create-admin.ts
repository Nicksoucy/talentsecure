/**
 * Script to create the first admin user
 *
 * Usage: npx tsx scripts/create-admin.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function createAdminUser() {
  console.log('\n' + '='.repeat(60));
  console.log('🔐 CRÉATION DU PREMIER UTILISATEUR ADMIN');
  console.log('='.repeat(60) + '\n');

  const email = 'admin@xguard.ca';
  const password = 'Admin123!'; // Change this password after first login!
  const firstName = 'Admin';
  const lastName = 'XGUARD';

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      console.log('⚠️  Un utilisateur avec cet email existe déjà!\n');
      console.log('Email:', email);
      console.log('\nVous pouvez vous connecter avec cet email.\n');
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role: 'ADMIN',
        isActive: true,
      },
    });

    console.log('✅ Utilisateur admin créé avec succès!\n');
    console.log('='.repeat(60));
    console.log('INFORMATIONS DE CONNEXION:');
    console.log('='.repeat(60));
    console.log('Email:        ', email);
    console.log('Mot de passe: ', password);
    console.log('='.repeat(60) + '\n');
    console.log('⚠️  IMPORTANT: Changez ce mot de passe après la première connexion!\n');
    console.log('🌐 Allez sur http://localhost:5173 pour vous connecter\n');

  } catch (error: any) {
    console.error('❌ Erreur lors de la création de l\'utilisateur:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createAdminUser();
