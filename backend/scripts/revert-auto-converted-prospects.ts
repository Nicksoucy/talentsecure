/**
 * Script pour re-convertir les candidats auto-convertis en prospects
 *
 * Ce script identifie les candidats qui ont été automatiquement convertis
 * depuis des prospects via l'IA et les re-convertit en prospects.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function revertAutoConvertedCandidates() {
  console.log('🔍 Recherche des candidats auto-convertis...');

  // Trouver tous les candidats avec "Auto-Converti" dans hrNotes
  const autoConvertedCandidates = await prisma.candidate.findMany({
    where: {
      hrNotes: {
        contains: 'Auto-Converti',
        mode: 'insensitive',
      },
      isDeleted: false,
    },
  });

  console.log(`✅ Trouvé ${autoConvertedCandidates.length} candidat(s) auto-converti(s)`);

  for (const candidate of autoConvertedCandidates) {
    console.log(`\n📝 Traitement: ${candidate.firstName} ${candidate.lastName}`);
    console.log(`   ID: ${candidate.id}`);
    console.log(`   Email: ${candidate.email}`);
    console.log(`   Téléphone: ${candidate.phone}`);

    try {
      // 1. Vérifier si un prospect avec cet ID existe déjà
      const existingProspect = await prisma.prospectCandidate.findFirst({
        where: {
          OR: [
            { convertedToId: candidate.id },
            { email: candidate.email || undefined },
            { phone: candidate.phone },
          ],
          isDeleted: false,
        },
      });

      if (existingProspect) {
        console.log(`   ⚠️  Prospect existant trouvé (ID: ${existingProspect.id})`);

        // Si le prospect était marqué comme converti, le dé-convertir
        if (existingProspect.isConverted) {
          await prisma.prospectCandidate.update({
            where: { id: existingProspect.id },
            data: {
              isConverted: false,
              convertedAt: null,
              convertedToId: null,
            },
          });
          console.log(`   ✅ Prospect dé-converti`);
        }

        // Supprimer le candidat (soft delete)
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            isDeleted: true,
            deletedAt: new Date(),
          },
        });
        console.log(`   ✅ Candidat supprimé (soft delete)`);
      } else {
        // 2. Créer un nouveau prospect avec les données du candidat
        const newProspect = await prisma.prospectCandidate.create({
          data: {
            firstName: candidate.firstName,
            lastName: candidate.lastName,
            email: candidate.email,
            phone: candidate.phone,
            fullAddress: candidate.address,
            city: candidate.city,
            province: candidate.province,
            postalCode: candidate.postalCode,
            cvUrl: candidate.cvUrl,
            cvStoragePath: candidate.cvStoragePath,
            isContacted: false,
            isConverted: false,
            notes: `Re-créé depuis candidat auto-converti (ID original: ${candidate.id})`,
          },
        });
        console.log(`   ✅ Nouveau prospect créé (ID: ${newProspect.id})`);

        // 3. Supprimer le candidat (soft delete)
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            isDeleted: true,
            deletedAt: new Date(),
          },
        });
        console.log(`   ✅ Candidat supprimé (soft delete)`);
      }
    } catch (error) {
      console.error(`   ❌ Erreur lors du traitement:`, error);
    }
  }

  console.log('\n✅ Script terminé!');
}

revertAutoConvertedCandidates()
  .catch((error) => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
