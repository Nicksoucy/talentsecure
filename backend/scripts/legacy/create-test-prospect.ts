import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function createTestProspect() {
  console.log('=== CREATING TEST PROSPECT WITH REAL CV FILE ===\n');

  // Get first file from uploads/cv
  const uploadsPath = path.join(__dirname, 'uploads', 'cv');
  const files = fs.readdirSync(uploadsPath).filter(f => f.endsWith('.pdf'));

  if (files.length === 0) {
    console.log('No PDF files found in uploads/cv');
    return;
  }

  const testFile = files[0];
  console.log(`Using test file: ${testFile}`);

  // Extract UUID and name from filename
  // Format: UUID_firstname_lastname.pdf
  const match = testFile.match(/^([a-f0-9\-]{36})_(.+)\.pdf$/i);

  let prospectId: string;
  let firstName: string;
  let lastName: string;

  if (match) {
    prospectId = match[1];
    const namePart = match[2];
    const nameParts = namePart.split('_');
    firstName = nameParts[0] || 'Test';
    lastName = nameParts.slice(1).join(' ') || 'Prospect';
  } else {
    prospectId = uuidv4();
    firstName = 'Test';
    lastName = 'Prospect';
  }

  console.log(`Creating prospect with ID: ${prospectId}`);
  console.log(`Name: ${firstName} ${lastName}\n`);

  // Check if prospect already exists
  const existing = await prisma.prospectCandidate.findUnique({
    where: { id: prospectId }
  });

  if (existing) {
    console.log(`✓ Prospect already exists!`);
    console.log(`  cvStoragePath: ${existing.cvStoragePath}`);
    console.log(`  isConverted: ${existing.isConverted}`);
    console.log(`  isDeleted: ${existing.isDeleted}`);

    // Update the cvStoragePath to point to the actual file
    await prisma.prospectCandidate.update({
      where: { id: prospectId },
      data: {
        cvStoragePath: testFile,
        isDeleted: false,
        isConverted: false
      }
    });

    console.log(`\n✓ Updated cvStoragePath to: ${testFile}`);
  } else {
    // Create new test prospect
    const prospect = await prisma.prospectCandidate.create({
      data: {
        id: prospectId,
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@test.com`,
        phone: '+15145551234',
        city: 'Montreal',
        province: 'Québec',
        cvStoragePath: testFile,  // Point to actual file
        isDeleted: false,
        isConverted: false
      }
    });

    console.log(`✓ Created test prospect!`);
    console.log(`  ID: ${prospect.id}`);
    console.log(`  Email: ${prospect.email}`);
    console.log(`  cvStoragePath: ${prospect.cvStoragePath}`);
  }

  // Verify file exists
  const fullPath = path.join(uploadsPath, testFile);
  const stats = fs.statSync(fullPath);

  console.log(`\n✓ File verified:`);
  console.log(`  Path: ${fullPath}`);
  console.log(`  Size: ${stats.size} bytes`);
  console.log(`  Exists: true`);

  console.log(`\n✅ Test prospect ready! You can now test extraction with ID: ${prospectId}`);

  await prisma.$disconnect();
}

createTestProspect()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
