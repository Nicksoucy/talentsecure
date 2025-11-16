import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();

async function check() {
  try {
    const candidate = await prisma.candidate.findUnique({
      where: { id: 'fdca7349-7f5d-4ba2-bb9d-6521da9d3829' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        videoUrl: true,
        videoStoragePath: true,
      }
    });

    console.log('\n🔍 Données du candidat dans la base de données:\n');
    console.log(JSON.stringify(candidate, null, 2));
    console.log('\n');

  } catch (error: any) {
    console.error('Erreur:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
