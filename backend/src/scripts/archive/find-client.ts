import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findClient() {
  try {
    const searchTerm = process.argv[2] || 'xguard';

    const clients = await prisma.client.findMany({
      where: {
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { companyName: { contains: searchTerm, mode: 'insensitive' } },
          { email: { contains: searchTerm, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        companyName: true,
        email: true,
        password: true,
        createdAt: true,
      },
    });

    if (clients.length === 0) {
      console.log(`\n❌ Aucun client trouvé avec le terme: "${searchTerm}"\n`);
      return;
    }

    console.log(`\n✅ ${clients.length} client(s) trouvé(s):\n`);
    clients.forEach((client, index) => {
      console.log(`[${index + 1}]`);
      console.log(`   ID: ${client.id}`);
      console.log(`   Nom: ${client.name}`);
      console.log(`   Compagnie: ${client.companyName || 'N/A'}`);
      console.log(`   Email: ${client.email}`);
      console.log(`   Mot de passe: ${client.password ? '✅ Configuré' : '❌ Non configuré'}`);
      console.log(`   Créé le: ${client.createdAt.toLocaleDateString()}`);
      console.log('');
    });
  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findClient();
