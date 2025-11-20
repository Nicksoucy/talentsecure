import { PrismaClient } from '@prisma/client';
import { cvExtractionService } from './src/services/cv-extraction.service';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function testPDFExtraction() {
  console.log('=== TESTING PDF TEXT EXTRACTION ===\n');

  // Get one prospect with CV
  const prospect = await prisma.prospectCandidate.findFirst({
    where: {
      cvStoragePath: { not: null },
      isDeleted: false,
      isConverted: false
    }
  });

  if (!prospect || !prospect.cvStoragePath) {
    console.log('No prospect with CV storage path found');
    return;
  }

  console.log(`Prospect: ${prospect.firstName} ${prospect.lastName}`);
  console.log(`CV Path: ${prospect.cvStoragePath}`);

  // Check if file exists
  const fullPath = path.join(__dirname, '..', prospect.cvStoragePath);
  console.log(`Full path: ${fullPath}`);
  console.log(`File exists: ${fs.existsSync(fullPath)}`);

  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    console.log(`File size: ${stats.size} bytes`);
  }

  // Extract text using the service
  console.log('\nExtracting text...');
  const cvText = await cvExtractionService.getCandidateText(prospect.id, true);

  console.log(`\nExtracted text length: ${cvText.length} characters`);
  console.log('\n--- FIRST 500 CHARACTERS ---');
  console.log(cvText.substring(0, 500));
  console.log('\n--- LAST 500 CHARACTERS ---');
  console.log(cvText.substring(Math.max(0, cvText.length - 500)));

  await prisma.$disconnect();
}

testPDFExtraction()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
