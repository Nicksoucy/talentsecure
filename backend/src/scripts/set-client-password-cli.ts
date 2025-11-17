import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../utils/password';

const prisma = new PrismaClient();

async function setClientPassword() {
  try {
    const email = process.argv[2];
    const password = process.argv[3];

    if (!email || !password) {
      console.error('\n❌ Usage: npx tsx src/scripts/set-client-password-cli.ts <email> <password>\n');
      console.log('Exemple:');
      console.log('  npx tsx src/scripts/set-client-password-cli.ts rh@xguard.ca MyPassword123\n');
      process.exit(1);
    }

    if (password.length < 6) {
      console.error('❌ Le mot de passe doit contenir au moins 6 caractères');
      process.exit(1);
    }

    console.log('🔐 Configuration du mot de passe client...\n');

    // Find client
    const client = await prisma.client.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!client) {
      console.error(`❌ Aucun client trouvé avec l'email: ${email}`);
      process.exit(1);
    }

    console.log(`✅ Client trouvé:`);
    console.log(`   - Nom: ${client.name}`);
    console.log(`   - Compagnie: ${client.companyName || 'N/A'}`);
    console.log(`   - Email: ${client.email}\n`);

    // Hash password
    console.log('🔄 Hachage du mot de passe...');
    const hashedPassword = await hashPassword(password);

    // Update client
    await prisma.client.update({
      where: { id: client.id },
      data: { password: hashedPassword },
    });

    console.log('✅ Mot de passe configuré avec succès!\n');
    console.log(`Le client peut maintenant se connecter avec:`);
    console.log(`   - Email: ${client.email}`);
    console.log(`   - Mot de passe: ${password}\n`);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
setClientPassword();
