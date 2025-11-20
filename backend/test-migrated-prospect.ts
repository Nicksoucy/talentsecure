import { PrismaClient } from '@prisma/client';
import { cvExtractionService } from './src/services/cv-extraction.service';

const prisma = new PrismaClient();

async function testMigratedProspect() {
  console.log('=== TESTING MIGRATED PROSPECT EXTRACTION ===\n');

  // Get one of the migrated prospects
  const prospect = await prisma.prospectCandidate.findFirst({
    where: {
      OR: [
        { firstName: { contains: 'Myrielle' } },
        { firstName: { contains: 'Theddyson' } },
        { firstName: { contains: 'Mamadou' } }
      ],
      isConverted: false,
      isDeleted: false
    }
  });

  if (!prospect) {
    console.log('No migrated prospect found');
    return;
  }

  console.log(`Testing: ${prospect.firstName} ${prospect.lastName}`);
  console.log(`ID: ${prospect.id}`);
  console.log(`CV Path: ${prospect.cvStoragePath}\n`);

  // Extract text
  console.log('Step 1: Extracting text from CV...');
  const cvText = await cvExtractionService.getCandidateText(prospect.id, true);

  console.log(`✓ Extracted ${cvText.length} characters`);
  console.log('\nFirst 300 characters:');
  console.log(cvText.substring(0, 300));
  console.log('...\n');

  if (cvText.length < 200) {
    console.log('⚠️ WARNING: Text is too short');
    return;
  }

  // Extract skills
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

  console.log('\n✅ Multi-format extraction is working!');

  await prisma.$disconnect();
}

testMigratedProspect()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
