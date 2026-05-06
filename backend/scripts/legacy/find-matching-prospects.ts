import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function findMatchingProspects() {
  console.log('=== FINDING PROSPECTS WITH MATCHING CV FILES ===\n');

  // Get all files in uploads/cv
  const uploadsPath = path.join(__dirname, 'uploads', 'cv');
  const files = fs.readdirSync(uploadsPath);

  console.log(`Total files in uploads/cv: ${files.length}\n`);

  // Extract UUIDs from filenames
  const fileIds = files
    .filter(f => f.endsWith('.pdf'))
    .map(f => {
      // Extract UUID prefix (before first underscore)
      const match = f.match(/^([a-f0-9\-]{36})/);
      return match ? match[1] : null;
    })
    .filter(Boolean) as string[];

  console.log(`Files with UUID prefixes: ${fileIds.length}`);
  console.log(`First 5 UUIDs: ${fileIds.slice(0, 5).join(', ')}\n`);

  // Check each UUID to see if it's a prospect or candidate
  let foundProspects = 0;
  let foundCandidates = 0;
  let foundNeither = 0;

  for (const id of fileIds.slice(0, 10)) {  // Check first 10
    const prospect = await prisma.prospectCandidate.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, cvStoragePath: true, isConverted: true }
    });

    const candidate = await prisma.candidate.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, cvStoragePath: true }
    });

    if (prospect) {
      foundProspects++;
      const fileName = files.find(f => f.startsWith(id));
      console.log(`✓ PROSPECT: ${prospect.firstName} ${prospect.lastName}`);
      console.log(`  ID: ${id}`);
      console.log(`  File: ${fileName}`);
      console.log(`  DB Path: ${prospect.cvStoragePath}`);
      console.log(`  Converted: ${prospect.isConverted}`);
      console.log('');
    } else if (candidate) {
      foundCandidates++;
      const fileName = files.find(f => f.startsWith(id));
      console.log(`✓ CANDIDATE: ${candidate.firstName} ${candidate.lastName}`);
      console.log(`  ID: ${id}`);
      console.log(`  File: ${fileName}`);
      console.log(`  DB Path: ${candidate.cvStoragePath}`);
      console.log('');
    } else {
      foundNeither++;
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Prospects with matching files: ${foundProspects}`);
  console.log(`Candidates with matching files: ${foundCandidates}`);
  console.log(`IDs not found in DB: ${foundNeither}`);

  await prisma.$disconnect();
}

findMatchingProspects()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
