/**
 * Crée ou réinitialise un utilisateur ADMIN.
 *
 * Remplacement sûr de l'ancien endpoint backdoor /api/auth/seed-admin
 * (supprimé dans Sprint 1 sécurité).
 *
 * Usage:
 *   npx tsx scripts/create-admin.ts <email> <password> [firstName] [lastName]
 *
 * Exemples:
 *   npx tsx scripts/create-admin.ts admin@xguard.ca 'MonMotDePasseFort!2026'
 *   npx tsx scripts/create-admin.ts nick@xguard.ca 'P@ssw0rd-Strong-2026' Nick Soucy
 *
 * Comportement:
 *   - Si l'utilisateur existe : reset du mot de passe + force role=ADMIN + isActive=true
 *   - Sinon : création d'un nouvel utilisateur ADMIN
 *   - Log d'audit créé en DB dans les deux cas
 *   - Échec si le mot de passe ne respecte pas les règles de force
 *
 * Sécurité:
 *   - DATABASE_URL doit être présent dans .env (lu par dotenv)
 *   - Aucune valeur hardcodée — tout vient des arguments CLI
 *   - Le mot de passe est hashé via bcrypt (10 rounds) avant insertion
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { hashPassword } from '../src/utils/password';

dotenv.config();

const prisma = new PrismaClient();

const PASSWORD_MIN_LENGTH = 12;

function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères`;
  }
  if (!/[a-z]/.test(password)) return 'Le mot de passe doit contenir une minuscule';
  if (!/[A-Z]/.test(password)) return 'Le mot de passe doit contenir une majuscule';
  if (!/[0-9]/.test(password)) return 'Le mot de passe doit contenir un chiffre';
  if (!/[^a-zA-Z0-9]/.test(password)) return 'Le mot de passe doit contenir un caractère spécial';
  return null;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function printUsageAndExit(): never {
  console.error('\nUsage: npx tsx scripts/create-admin.ts <email> <password> [firstName] [lastName]\n');
  console.error('Exemple: npx tsx scripts/create-admin.ts admin@xguard.ca \'MonMotDePasseFort!2026\' Admin XGUARD\n');
  process.exit(1);
}

async function createOrResetAdmin() {
  const [, , email, password, firstName, lastName] = process.argv;

  if (!email || !password) {
    console.error('❌ Email et mot de passe sont requis.');
    printUsageAndExit();
  }

  if (!validateEmail(email)) {
    console.error(`❌ Email invalide: ${email}`);
    process.exit(1);
  }

  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    console.error(`❌ ${passwordError}`);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL manquant dans .env');
    process.exit(1);
  }

  const normalizedEmail = email.toLowerCase();
  const hashedPassword = await hashPassword(password);

  console.log('\n' + '='.repeat(60));
  console.log('🔐 GESTION UTILISATEUR ADMIN');
  console.log('='.repeat(60));

  try {
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (existingUser) {
      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          password: hashedPassword,
          role: 'ADMIN',
          isActive: true,
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: updated.id,
          action: 'UPDATE',
          resource: 'User',
          resourceId: updated.id,
          details: 'Réinitialisation mot de passe ADMIN via scripts/create-admin.ts',
        },
      });

      console.log('✅ Utilisateur existant mis à jour (mot de passe réinitialisé, rôle ADMIN appliqué)');
      console.log(`   Email: ${updated.email}`);
      console.log(`   ID:    ${updated.id}`);
    } else {
      const created = await prisma.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          firstName: firstName || 'Admin',
          lastName: lastName || 'XGUARD',
          role: 'ADMIN',
          isActive: true,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: created.id,
          action: 'CREATE',
          resource: 'User',
          resourceId: created.id,
          details: 'Création utilisateur ADMIN via scripts/create-admin.ts',
        },
      });

      console.log('✅ Nouvel utilisateur ADMIN créé');
      console.log(`   Email: ${created.email}`);
      console.log(`   ID:    ${created.id}`);
    }

    console.log('='.repeat(60));
    console.log('⚠️  Le mot de passe ne sera pas affiché. Conservez-le en lieu sûr.');
    console.log('='.repeat(60) + '\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Erreur: ${message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createOrResetAdmin();
