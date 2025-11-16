/**
 * Script to fix candidates with videoStoragePath but no videoUrl
 *
 * This fixes candidates where videos were uploaded before the videoUrl field was being set
 *
 * Usage: npx tsx scripts/fix-video-urls.ts
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { getVideoUrl } from '../src/services/video.service';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function fixVideoUrls() {
  console.log('\n' + '='.repeat(60));
  console.log('🎥 CORRECTION DES URLs DE VIDÉOS');
  console.log('='.repeat(60) + '\n');

  try {
    // Find candidates with videoStoragePath but no videoUrl
    const candidates = await prisma.candidate.findMany({
      where: {
        videoStoragePath: { not: null },
        OR: [
          { videoUrl: null },
          { videoUrl: '' },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        videoStoragePath: true,
      },
    });

    if (candidates.length === 0) {
      console.log('✅ Aucun candidat à corriger. Tous les candidats avec vidéo ont déjà un videoUrl.\n');
      return;
    }

    console.log(`📋 Trouvé ${candidates.length} candidat(s) à corriger:\n`);

    for (const candidate of candidates) {
      console.log(`   - ${candidate.firstName} ${candidate.lastName} (${candidate.id})`);
    }

    console.log('\n' + '-'.repeat(60) + '\n');

    // Update each candidate
    let successCount = 0;
    let errorCount = 0;

    for (const candidate of candidates) {
      try {
        // Generate the video URL from the storage path
        const videoUrl = getVideoUrl(candidate.videoStoragePath!);

        // Update the candidate
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: { videoUrl },
        });

        console.log(`✅ ${candidate.firstName} ${candidate.lastName}: URL mise à jour`);
        console.log(`   Storage Path: ${candidate.videoStoragePath}`);
        console.log(`   Video URL: ${videoUrl}\n`);

        successCount++;
      } catch (error: any) {
        console.error(`❌ ${candidate.firstName} ${candidate.lastName}: Erreur`);
        console.error(`   ${error.message}\n`);
        errorCount++;
      }
    }

    console.log('='.repeat(60));
    console.log('RÉSUMÉ');
    console.log('='.repeat(60));
    console.log(`✅ Succès: ${successCount}`);
    console.log(`❌ Erreurs: ${errorCount}`);
    console.log(`📊 Total: ${candidates.length}`);
    console.log('='.repeat(60) + '\n');

    if (successCount > 0) {
      console.log('🎉 Les vidéos devraient maintenant s\'afficher correctement dans l\'application!\n');
    }

  } catch (error: any) {
    console.error('❌ Erreur lors de la correction des URLs:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixVideoUrls();
