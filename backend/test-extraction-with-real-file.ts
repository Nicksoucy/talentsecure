import { PrismaClient } from '@prisma/client';
import { cvExtractionService } from './src/services/cv-extraction.service';

const prisma = new PrismaClient();

async function testExtractionWithRealFile() {
  console.log('=== TESTING EXTRACTION WITH REAL CV FILE ===\n');

  const prospectId = '022f6281-9452-4f90-832b-bc3791b9052f';

  // Get prospect
  const prospect = await prisma.prospectCandidate.findUnique({
    where: { id: prospectId }
  });

  if (!prospect) {
    console.log('Prospect not found!');
    return;
  }

  console.log(`Prospect: ${prospect.firstName} ${prospect.lastName}`);
  console.log(`CV Path: ${prospect.cvStoragePath}\n`);

  // Step 1: Extract text from CV
  console.log('Step 1: Extracting text from CV...');
  const cvText = await cvExtractionService.getCandidateText(prospectId, true);

  console.log(`✓ Extracted ${cvText.length} characters`);
  console.log('\nFirst 500 characters:');
  console.log(cvText.substring(0, 500));
  console.log('\n---\n');

  if (cvText.length < 500) {
    console.log('⚠️ WARNING: Text is too short, PDF may not have been extracted properly');
    return;
  }

  // Step 2: Extract skills
  console.log('Step 2: Extracting skills from text...');
  const extraction = await cvExtractionService.extractSkillsFromText(prospectId, cvText);

  console.log(`✓ Success: ${extraction.success}`);
  console.log(`✓ Skills found: ${extraction.totalSkills}`);
  console.log(`✓ Processing time: ${extraction.processingTimeMs}ms\n`);

  if (extraction.skillsFound.length > 0) {
    console.log('Skills extracted:');
    extraction.skillsFound.forEach((skill, index) => {
      console.log(`  ${index + 1}. ${skill.skillName} (confidence: ${skill.confidence.toFixed(2)}, level: ${skill.level})`);
      if (skill.yearsExperience) {
        console.log(`     Years: ${skill.yearsExperience}`);
      }
    });
  } else {
    console.log('⚠️ No skills found in CV');
  }

  // Step 3: Save skills
  if (extraction.skillsFound.length > 0) {
    console.log('\nStep 3: Saving skills to database...');

    // Get admin user for conversion
    const adminUser = await prisma.user.findFirst();

    if (!adminUser) {
      console.log('ERROR: No user found for conversion');
      return;
    }

    const beforeCount = await prisma.candidateSkill.count({
      where: { candidateId: prospectId }
    });

    const saveResult = await cvExtractionService.saveExtractedSkills(
      prospectId,
      extraction.skillsFound,
      false,
      true,
      adminUser.id
    );

    const afterCount = await prisma.candidateSkill.count({
      where: { candidateId: prospectId }
    });

    console.log(`✓ Save result: ${JSON.stringify(saveResult)}`);
    console.log(`✓ Candidate-skill links before: ${beforeCount}`);
    console.log(`✓ Candidate-skill links after: ${afterCount}`);

    // Check if prospect was converted
    const updatedProspect = await prisma.prospectCandidate.findUnique({
      where: { id: prospectId }
    });

    console.log(`✓ Prospect converted: ${updatedProspect?.isConverted ? 'YES' : 'NO'}`);

    // Verify candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id: prospectId },
      include: {
        candidateSkills: {
          include: {
            skill: true
          },
          take: 5
        }
      }
    });

    if (candidate) {
      console.log(`✓ Candidate exists: YES`);
      console.log(`✓ Total candidate skills in DB: ${candidate.candidateSkills.length}`);

      if (candidate.candidateSkills.length > 0) {
        console.log('\nFirst 5 linked skills:');
        candidate.candidateSkills.forEach((cs, i) => {
          console.log(`  ${i + 1}. ${cs.skill.name} (level: ${cs.level}, confidence: ${cs.confidence})`);
        });
      }
    }
  }

  console.log('\n=== TEST COMPLETE ===');

  await prisma.$disconnect();
}

testExtractionWithRealFile()
  .then(() => {
    console.log('\n✅ Success!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
