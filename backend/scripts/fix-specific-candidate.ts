import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { getVideoUrl } from '../src/services/video.service';

dotenv.config();
const prisma = new PrismaClient();

async function fixCandidate() {
  try {
    const candidateId = 'fdca7349-7f5d-4ba2-bb9d-6521da9d3829';

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        videoUrl: true,
        videoStoragePath: true,
      }
    });

    if (!candidate) {
      console.log('❌ Candidat non trouvé');
      return;
    }

    console.log('\n📋 Avant correction:');
    console.log(JSON.stringify(candidate, null, 2));

    if (!candidate.videoStoragePath) {
      console.log('❌ Pas de videoStoragePath');
      return;
    }

    // Generate correct video URL
    const correctVideoUrl = getVideoUrl(candidate.videoStoragePath);

    // Update the candidate
    await prisma.candidate.update({
      where: { id: candidateId },
      data: { videoUrl: correctVideoUrl }
    });

    console.log('\n✅ Après correction:');
    console.log({
      id: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      videoUrl: correctVideoUrl,
      videoStoragePath: candidate.videoStoragePath,
    });
    console.log('\n🎉 Vidéo corrigée avec succès!\n');

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixCandidate();
