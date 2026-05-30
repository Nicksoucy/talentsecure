import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDuplicates() {
  try {
    console.log('🔍 Vérification des doublons...\n');

    // Get all candidates
    const allCandidates = await prisma.candidate.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    console.log(`Total de candidats: ${allCandidates.length}\n`);

    // Group by email
    const emailGroups: { [key: string]: typeof allCandidates } = {};

    allCandidates.forEach(candidate => {
      const email = (candidate.email || 'NO_EMAIL').toLowerCase();
      if (!emailGroups[email]) {
        emailGroups[email] = [];
      }
      emailGroups[email].push(candidate);
    });

    // Find duplicates
    const duplicates = Object.entries(emailGroups).filter(([_, candidates]) => candidates.length > 1);

    if (duplicates.length > 0) {
      console.log(`📋 Doublons trouvés: ${duplicates.length}\n`);

      duplicates.forEach(([email, candidates]) => {
        console.log(`Email: ${email} (${candidates.length} candidats)`);
        candidates.forEach((c, i) => {
          console.log(`  ${i + 1}. ${c.firstName} ${c.lastName} - créé le ${c.createdAt.toISOString()}`);
        });
        console.log('');
      });

      // Count total duplicates to delete (keep newest)
      const totalToDelete = duplicates.reduce((sum, [_, candidates]) => sum + (candidates.length - 1), 0);
      console.log(`\n📊 Total de doublons à supprimer: ${totalToDelete}`);
    } else {
      console.log('✅ Aucun doublon trouvé');
    }

    // Show candidates without email
    const noEmail = allCandidates.filter(c => !c.email);
    if (noEmail.length > 0) {
      console.log(`\n⚠️  Candidats sans email: ${noEmail.length}`);
      noEmail.forEach(c => {
        console.log(`  - ${c.firstName} ${c.lastName} (créé le ${c.createdAt.toISOString()})`);
      });
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDuplicates();
