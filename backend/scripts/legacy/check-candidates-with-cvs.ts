import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function checkCandidatesWithCVs() {
  console.log('=== CHECKING CANDIDATES WITH CV FILES ===\n');

  // Get candidates with CVs
  const candidates = await prisma.candidate.findMany({
    where: {
      cvStoragePath: { not: null },
      isDeleted: false
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      cvStoragePath: true
    },
    take: 20
  });

  console.log(`Found ${candidates.length} candidates with cvStoragePath\n`);

  const uploadsPath = path.join(__dirname, 'uploads', 'cv');
  const files = fs.readdirSync(uploadsPath);

  let filesFound = 0;
  let filesNotFound = 0;

  for (const candidate of candidates) {
    // Check if file exists with candidate ID prefix
    const matchingFile = files.find(f => f.startsWith(candidate.id));

    if (matchingFile) {
      filesFound++;
      console.log(`✓ ${candidate.firstName} ${candidate.lastName}`);
      console.log(`  ID: ${candidate.id}`);
      console.log(`  DB Path: ${candidate.cvStoragePath}`);
      console.log(`  Actual File: ${matchingFile}`);
      console.log('');
    } else {
      filesNotFound++;
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Candidates checked: ${candidates.length}`);
  console.log(`Files found: ${filesFound}`);
  console.log(`Files NOT found: ${filesNotFound}`);

  if (filesFound > 0) {
    console.log(`\n✅ We can test extraction with the ${filesFound} candidates who have actual files!`);
  } else {
    console.log(`\n⚠️ No candidates have matching CV files. Need to investigate further.`);
  }

  await prisma.$disconnect();
}

checkCandidatesWithCVs()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
