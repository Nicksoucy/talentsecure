import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function testBatchExtract() {
  console.log('Testing batch extract flow...\n');

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

  console.log(`Found prospect: ${prospect.firstName} ${prospect.lastName} (${prospect.id})`);
  console.log(`CV Path: ${prospect.cvStoragePath || prospect.cvUrl}`);

  // Simulate what happens in batchExtractSkills
  console.log('\nSimulating extraction flow:');
  console.log('1. Extract skills from CV...');
  console.log('2. Convert prospect to candidate...');
  console.log('3. Save skills to candidate_skills...');

  // Check if there are skills in DB
  const skillCount = await prisma.skill.count({ where: { isActive: true } });
  console.log(`\nActive skills in DB: ${skillCount}`);

  // Check if prospect was already converted
  if (prospect.isConverted) {
    console.log('ERROR: Prospect is already converted!');
    return;
  }

  await prisma.$disconnect();
}

testBatchExtract().catch(console.error);
