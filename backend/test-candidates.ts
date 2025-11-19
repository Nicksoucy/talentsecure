import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testCandidates() {
  console.log('🧪 Testing Candidates with CVs...\n');

  // Find prospects with CVs
  const prospectsWithCVs = await prisma.prospectCandidate.findMany({
    where: {
      isDeleted: false,
      isConverted: false,
      OR: [
        { cvUrl: { not: null } },
        { cvStoragePath: { not: null } }
      ]
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      cvUrl: true,
      cvStoragePath: true,
    },
    take: 5
  });

  console.log(`📄 Prospects with CVs: ${prospectsWithCVs.length}\n`);

  prospectsWithCVs.forEach((p, i) => {
    console.log(`${i + 1}. ${p.firstName} ${p.lastName}`);
    console.log(`   CV: ${p.cvUrl || p.cvStoragePath}`);
    console.log(`   ID: ${p.id}\n`);
  });

  // Check candidates (not prospects) with skills
  const candidatesWithSkills = await prisma.candidate.findMany({
    where: {
      isDeleted: false,
      candidateSkills: {
        some: {}
      }
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      _count: {
        select: {
          candidateSkills: true
        }
      }
    },
    take: 10
  });

  console.log(`\n👥 Candidates with linked skills: ${candidatesWithSkills.length}\n`);

  candidatesWithSkills.forEach((c, i) => {
    console.log(`${i + 1}. ${c.firstName} ${c.lastName} - ${c._count.candidateSkills} skills`);
  });

  await prisma.$disconnect();
}

testCandidates().catch(console.error);
