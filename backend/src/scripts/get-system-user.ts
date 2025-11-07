import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function getSystemUser() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'system@talentsecure.com' }
    });

    if (user) {
      console.log('✅ System user found!');
      console.log('ID:', user.id);
      console.log('Email:', user.email);
      console.log('Name:', user.firstName, user.lastName);
    } else {
      console.log('❌ System user not found');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

getSystemUser();
