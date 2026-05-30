import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { processCVUpload } from '../services/cv.service';

const prisma = new PrismaClient();

async function migrateProspectCVsToR2() {
  try {
    console.log('🔍 Recherche des prospects avec CVs GoHighLevel...\n');

    // Find all prospects with GoHighLevel CV URLs
    const prospects = await prisma.prospectCandidate.findMany({
      where: {
        cvUrl: {
          contains: 'leadconnectorhq.com',
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        cvUrl: true,
        cvStoragePath: true,
      },
    });

    console.log(`📊 Trouvé ${prospects.length} prospects avec CVs GoHighLevel\n`);

    if (prospects.length === 0) {
      console.log('✅ Aucun CV à migrer!');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    // Temp directory for downloads
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i];
      console.log(`\n[${i + 1}/${prospects.length}] ${prospect.firstName} ${prospect.lastName}`);
      console.log(`   GoHighLevel URL: ${prospect.cvUrl}`);

      try {
        // Download CV from GoHighLevel
        console.log('   📥 Téléchargement depuis GoHighLevel...');
        const response = await axios.get(prospect.cvUrl!, {
          responseType: 'arraybuffer',
          timeout: 30000,
        });

        // Save to temp file
        const fileName = `${prospect.firstName}_${prospect.lastName}.pdf`.replace(/\s+/g, '_');
        const tempFilePath = path.join(tempDir, fileName);
        fs.writeFileSync(tempFilePath, response.data);
        console.log(`   💾 Sauvegardé temporairement: ${fileName}`);

        // Upload to R2
        console.log('   ☁️  Upload vers R2...');
        const r2Key = await processCVUpload(tempFilePath, fileName);
        console.log(`   ✅ Uploadé sur R2: ${r2Key}`);

        // Update database
        await prisma.prospectCandidate.update({
          where: { id: prospect.id },
          data: {
            cvStoragePath: r2Key,
            // Keep the original GoHighLevel URL as backup
            // cvUrl stays the same for now
          },
        });

        console.log('   💾 Base de données mise à jour');

        // Clean up temp file
        fs.unlinkSync(tempFilePath);

        successCount++;
      } catch (error: any) {
        console.error(`   ❌ Erreur: ${error.message}`);
        errorCount++;
      }

      // Small delay to avoid rate limiting
      if (i < prospects.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Migration terminée!`);
    console.log(`   Succès: ${successCount}`);
    console.log(`   Erreurs: ${errorCount}`);
    console.log('='.repeat(60) + '\n');

    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir, { recursive: true });
    }
  } catch (error) {
    console.error('❌ Erreur fatale:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateProspectCVsToR2();
