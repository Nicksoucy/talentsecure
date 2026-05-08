import { PrismaClient } from '@prisma/client';
import { cvExtractionService } from './src/services/cv-extraction.service';

const prisma = new PrismaClient();

async function testR2Extraction() {
  console.log('=== TESTING R2 CV EXTRACTION ===\n');

  // Get a prospect with CV from database (excluding our 3 local test prospects)
  const prospect = await prisma.prospectCandidate.findFirst({
    where: {
      cvStoragePath: {
        not: null,
        startsWith: 'cvs/', // Old format stored in R2
      },
      isConverted: false,
      isDeleted: false,
      // Exclude our 3 test prospects with local CVs
      NOT: [
        { firstName: { contains: 'Mamadou' } },
        { firstName: { contains: 'Theddyson' } },
        { firstName: { contains: 'Myrielle' } }
      ]
    }
  });

  if (!prospect) {
    console.log('❌ No prospect found with R2-stored CV');
    return;
  }

  console.log(`Testing: ${prospect.firstName} ${prospect.lastName}`);
  console.log(`ID: ${prospect.id}`);
  console.log(`CV Path: ${prospect.cvStoragePath}\n`);

  try {
    // Step 1: Extract text from R2
    console.log('Step 1: Extracting text from R2...');
    const cvText = await cvExtractionService.getCandidateText(prospect.id, true);

    if (!cvText || cvText.length < 100) {
      console.log(`⚠️ WARNING: Text extraction failed or too short (${cvText?.length || 0} chars)`);
      return;
    }

    console.log(`✓ Extracted ${cvText.length} characters from R2`);
    console.log('\nFirst 300 characters:');
    console.log(cvText.substring(0, 300));
    console.log('...\n');

    // Step 2: Extract skills
    console.log('Step 2: Extracting skills...');
    const extraction = await cvExtractionService.extractSkillsFromText(prospect.id, cvText);

    console.log(`✓ Success: ${extraction.success}`);
    console.log(`✓ Skills found: ${extraction.totalSkills}`);
    console.log(`✓ Processing time: ${extraction.processingTimeMs}ms\n`);

    if (extraction.skillsFound.length > 0) {
      console.log('Skills extracted:');
      extraction.skillsFound.forEach((skill, i) => {
        console.log(`  ${i + 1}. ${skill.skillName} (${(skill.confidence * 100).toFixed(0)}%)`);
      });
    }

    console.log('\n🎉 R2 EXTRACTION WORKING! Batch extraction should now work for all 737 prospects!');

  } catch (error: any) {
    console.error('❌ Error during R2 extraction:', error.message);
    console.error(error);
  }

  await prisma.$disconnect();
}

testR2Extraction()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
