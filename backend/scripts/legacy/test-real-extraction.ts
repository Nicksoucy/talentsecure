import { PrismaClient } from '@prisma/client';
import { cvExtractionService } from './src/services/cv-extraction.service';

const prisma = new PrismaClient();

async function testRealExtraction() {
  console.log('=== TESTING REAL SKILL EXTRACTION ===\n');

  // Get one prospect with CV
  const prospect = await prisma.prospectCandidate.findFirst({
    where: {
      OR: [
        { cvStoragePath: { not: null } },
        { cvUrl: { not: null } }
      ],
      isDeleted: false,
      isConverted: false
    }
  });

  if (!prospect) {
    console.log('No prospect with CV found');
    return;
  }

  console.log(`Testing with prospect: ${prospect.firstName} ${prospect.lastName}`);
  console.log(`ID: ${prospect.id}`);
  console.log(`CV: ${prospect.cvStoragePath || prospect.cvUrl}\n`);

  // Step 1: Get CV text
  console.log('Step 1: Extracting text from CV...');
  const cvText = await cvExtractionService.getCandidateText(prospect.id, true);
  console.log(`✓ Extracted ${cvText.length} characters\n`);

  // Step 2: Extract skills
  console.log('Step 2: Extracting skills from text...');
  const extraction = await cvExtractionService.extractSkillsFromText(prospect.id, cvText);

  console.log(`✓ Extraction ${extraction.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`✓ Skills found: ${extraction.totalSkills}`);

  if (extraction.skillsFound.length > 0) {
    console.log('\nFirst 5 skills:');
    extraction.skillsFound.slice(0, 5).forEach(s => {
      console.log(`  - ${s.skillName} (confidence: ${s.confidence.toFixed(2)}, level: ${s.level})`);
    });
  }

  // Step 3: Save skills (with prospect conversion)
  console.log('\nStep 3: Saving skills to database...');

  // Check before saving
  const beforeCount = await prisma.candidateSkill.count({
    where: { candidateId: prospect.id }
  });
  console.log(`  Candidate-skill links before: ${beforeCount}`);

  // We need a userId for conversion - get any admin user
  const adminUser = await prisma.user.findFirst({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } }
  });

  if (!adminUser) {
    console.log('ERROR: No admin user found for conversion');
    return;
  }

  const saveResult = await cvExtractionService.saveExtractedSkills(
    prospect.id,
    extraction.skillsFound,
    false, // don't overwrite
    true,  // isProspect
    adminUser.id
  );

  console.log(`✓ Save result: ${JSON.stringify(saveResult)}`);

  // Check after saving
  const afterCount = await prisma.candidateSkill.count({
    where: { candidateId: prospect.id }
  });
  console.log(`  Candidate-skill links after: ${afterCount}`);

  // Check if prospect was converted
  const updatedProspect = await prisma.prospectCandidate.findUnique({
    where: { id: prospect.id }
  });
  console.log(`  Prospect converted: ${updatedProspect?.isConverted ? 'YES' : 'NO'}`);

  // Check if candidate was created
  const candidate = await prisma.candidate.findUnique({
    where: { id: prospect.id }
  });
  console.log(`  Candidate exists: ${candidate ? 'YES' : 'NO'}`);

  // Final check
  console.log('\n=== FINAL STATE ===');
  const totalCandidateSkills = await prisma.candidateSkill.count();
  console.log(`Total candidate-skill links in DB: ${totalCandidateSkills}`);

  await prisma.$disconnect();
}

testRealExtraction()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
