import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testSkills() {
  console.log('🧪 Testing Skills Functionality...\n');

  // 1. Count skills
  const skillCount = await prisma.skill.count();
  console.log(`📊 Total Skills: ${skillCount}`);

  // 2. Count candidate-skill links
  const candidateSkillCount = await prisma.candidateSkill.count();
  console.log(`🔗 Total Candidate-Skill Links: ${candidateSkillCount}\n`);

  if (skillCount === 0) {
    console.log('❌ No skills found in database!');
    console.log('💡 You need to extract skills from CVs first.\n');
  } else {
    // 3. Show sample skills with candidates
    console.log('📋 Sample Skills:\n');
    const skills = await prisma.skill.findMany({
      take: 10,
      orderBy: {
        candidateSkills: {
          _count: 'desc'
        }
      },
      include: {
        _count: {
          select: {
            candidateSkills: true
          }
        },
        candidateSkills: {
          take: 2,
          include: {
            candidate: {
              select: {
                firstName: true,
                lastName: true,
              }
            }
          }
        }
      }
    });

    skills.forEach((skill, i) => {
      console.log(`${i + 1}. ${skill.name} (${skill.category})`);
      console.log(`   📈 ${skill._count.candidateSkills} candidate(s)`);
      if (skill.candidateSkills.length > 0) {
        skill.candidateSkills.forEach(cs => {
          console.log(`   👤 ${cs.candidate.firstName} ${cs.candidate.lastName} - ${cs.level}`);
        });
      }
      console.log('');
    });
  }

  await prisma.$disconnect();
}

testSkills().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
