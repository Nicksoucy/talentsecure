import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../utils/password';
import * as readline from 'readline';

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function setClientPassword() {
  try {
    console.log('🔐 Configuration du mot de passe client\n');

    // Get client email
    const email = await question('Email du client: ');

    if (!email) {
      console.error('❌ Email requis');
      process.exit(1);
    }

    // Find client
    const client = await prisma.client.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!client) {
      console.error(`❌ Aucun client trouvé avec l'email: ${email}`);
      process.exit(1);
    }

    console.log(`\n✅ Client trouvé:`);
    console.log(`   - Nom: ${client.name}`);
    console.log(`   - Compagnie: ${client.companyName || 'N/A'}`);
    console.log(`   - Email: ${client.email}\n`);

    // Get password
    const password = await question('Nouveau mot de passe: ');

    if (!password || password.length < 6) {
      console.error('❌ Le mot de passe doit contenir au moins 6 caractères');
      process.exit(1);
    }

    // Confirm password
    const confirmPassword = await question('Confirmer le mot de passe: ');

    if (password !== confirmPassword) {
      console.error('❌ Les mots de passe ne correspondent pas');
      process.exit(1);
    }

    // Hash password
    console.log('\n🔄 Hachage du mot de passe...');
    const hashedPassword = await hashPassword(password);

    // Update client
    await prisma.client.update({
      where: { id: client.id },
      data: { password: hashedPassword },
    });

    console.log('✅ Mot de passe configuré avec succès!');
    console.log(`\nLe client peut maintenant se connecter avec:`);
    console.log(`   - Email: ${client.email}`);
    console.log(`   - Mot de passe: [le mot de passe que vous venez de définir]\n`);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

// Run the script
setClientPassword();
