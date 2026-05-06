import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkData() {
  console.log('DIAGNOSTIC - Current State of AI Extraction\n');

  // Count skills
  const skillCount = await prisma.skill.count();
  console.log(`Skills in DB: ${skillCount}`);

  // Count candidate-skill links
  const candidateSkillCount = await prisma.candidateSkill.count();
  console.log(`Candidate-Skill links: ${candidateSkillCount}`);

  // Count prospects with CV
  const prospectsWithCV = await prisma.prospectCandidate.count({
    where: {
      OR: [
        { cvUrl: { not: null } },
        { cvStoragePath: { not: null } }
      ],
      isDeleted: false,
      isConverted: false
    }
  });
  console.log(`Prospects with CV (not converted): ${prospectsWithCV}`);

  // Count candidates
  const candidateCount = await prisma.candidate.count();
  console.log(`Candidates: ${candidateCount}`);

  // Recent extraction logs
  const recentLogs = await prisma.cvExtractionLog.findMany({
    take: 5,
    orderBy: { extractedAt: 'desc' },
    select: {
      candidateId: true,
      method: true,
      skillsExtractedCount: true,
      success: true,
      extractedAt: true,
      errorMessage: true
    }
  });

  console.log('\n5 Most Recent Extractions:');
  if (recentLogs.length === 0) {
    console.log('  No extractions found in logs');
  } else {
    recentLogs.forEach(log => {
      const status = log.success ? 'SUCCESS' : 'FAILED';
      console.log(`  - ${log.extractedAt.toISOString()} | ${log.method} | ${log.skillsExtractedCount} skills | ${status}`);
      if (log.errorMessage) {
        console.log(`    Error: ${log.errorMessage}`);
      }
    });
  }

  await prisma.$disconnect();
}

checkData().catch(console.error);
