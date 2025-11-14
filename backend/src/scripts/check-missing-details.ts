import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAbsents() {
  const allCandidates = await prisma.candidate.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      hrNotes: true,
      interviewDetails: true
    },
    orderBy: {
      lastName: 'asc'
    }
  });

  // Filtrer ceux sans détails ou absents
  const candidates = allCandidates.filter(c =>
    !c.interviewDetails ||
    c.hrNotes?.toLowerCase().includes('absent')
  );

  console.log('📊 Candidats sans détails d\'entrevue ou absents:\n');
  candidates.forEach((c, i) => {
    const hasDetails = c.interviewDetails ? '✅' : '❌';
    const hrNote = c.hrNotes || '(pas de note)';
    console.log(`${i+1}. ${hasDetails} ${c.firstName} ${c.lastName}`);
    console.log(`   HR: ${hrNote.substring(0, 80)}`);
    console.log('');
  });

  console.log(`Total: ${candidates.length} candidats\n`);
  console.log(`Total dans la DB: ${allCandidates.length} candidats\n`);

  await prisma.$disconnect();
}

checkAbsents();
