import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function checkCVPaths() {
  console.log('=== CHECKING CV STORAGE PATHS ===\n');

  // Get 10 prospects with CVs
  const prospects = await prisma.prospectCandidate.findMany({
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
    take: 10
  });

  console.log(`Found ${prospects.length} prospects with CV paths\n`);

  for (const prospect of prospects) {
    const storagePath = prospect.cvStoragePath!;

    // Check different possible paths
    const paths = [
      path.join(__dirname, '..', storagePath),  // Relative from backend
      path.join(__dirname, 'uploads', 'cv', storagePath),  // In uploads/cv
      path.join(__dirname, 'uploads', 'cv', path.basename(storagePath)),  // Just filename in uploads/cv
    ];

    let found = false;
    let foundPath = '';

    for (const testPath of paths) {
      if (fs.existsSync(testPath)) {
        found = true;
        foundPath = testPath;
        break;
      }
    }

    console.log(`${prospect.firstName} ${prospect.lastName}`);
    console.log(`  ID: ${prospect.id}`);
    console.log(`  DB Path: ${storagePath}`);
    console.log(`  Found: ${found ? 'YES at ' + foundPath : 'NO'}`);
    console.log('');
  }

  // Check for files in uploads/cv that might match the IDs
  const uploadsPath = path.join(__dirname, 'uploads', 'cv');
  const files = fs.readdirSync(uploadsPath);

  console.log(`\nTotal files in uploads/cv: ${files.length}`);
  console.log(`\nFirst 5 files:`);
  files.slice(0, 5).forEach(f => console.log(`  - ${f}`));

  await prisma.$disconnect();
}

checkCVPaths()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
