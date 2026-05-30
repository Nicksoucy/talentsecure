import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

// Use environment variable or command line argument for CV source directory
const SOURCE_DIR = process.env.CV_SOURCE_DIR || process.argv[2] || path.join(process.cwd(), '../cv candidats');
const DEST_DIR = path.join(__dirname, '../../uploads/cvs');

// Ensure destination directory exists
if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
}

interface ImportResult {
  filename: string;
  success: boolean;
  candidateId?: string;
  candidateName?: string;
  error?: string;
}

/**
 * Parse filename to extract first and last names
 * Format: "10-Mananga Justin OMEKAKANDA.pdf"
 * Returns: { firstName: "Mananga Justin", lastName: "OMEKAKANDA" }
 */
function parseFilename(filename: string): { firstName: string; lastName: string } | null {
  try {
    // Remove .pdf extension
    const nameWithoutExt = filename.replace('.pdf', '');

    // Remove number prefix (e.g., "10-")
    const nameWithoutNumber = nameWithoutExt.replace(/^\d+-/, '');

    // Split by spaces
    const parts = nameWithoutNumber.trim().split(/\s+/);

    if (parts.length < 2) {
      console.log(`⚠️  Could not parse filename: ${filename}`);
      return null;
    }

    // Last part is usually the last name (often in uppercase)
    const lastName = parts[parts.length - 1];

    // Everything else is the first name(s)
    const firstName = parts.slice(0, -1).join(' ');

    return { firstName, lastName };
  } catch (error) {
    console.error(`Error parsing filename ${filename}:`, error);
    return null;
  }
}

/**
 * Find candidate by name with fuzzy matching
 */
async function findCandidateByName(
  firstName: string,
  lastName: string
): Promise<any | null> {
  try {
    // Try exact match first
    let candidate = await prisma.candidate.findFirst({
      where: {
        isDeleted: false,
        OR: [
          {
            firstName: { equals: firstName, mode: 'insensitive' },
            lastName: { equals: lastName, mode: 'insensitive' },
          },
          // Try reversed (firstName might be lastName and vice versa)
          {
            firstName: { equals: lastName, mode: 'insensitive' },
            lastName: { equals: firstName, mode: 'insensitive' },
          },
        ],
      },
    });

    if (candidate) {
      return candidate;
    }

    // Try partial match on both first and last name
    candidate = await prisma.candidate.findFirst({
      where: {
        isDeleted: false,
        OR: [
          {
            firstName: { contains: firstName, mode: 'insensitive' },
            lastName: { contains: lastName, mode: 'insensitive' },
          },
          {
            firstName: { contains: lastName, mode: 'insensitive' },
            lastName: { contains: firstName, mode: 'insensitive' },
          },
        ],
      },
    });

    if (candidate) {
      return candidate;
    }

    // Try matching just the last name (most reliable)
    const candidates = await prisma.candidate.findMany({
      where: {
        isDeleted: false,
        lastName: { contains: lastName, mode: 'insensitive' },
      },
    });

    if (candidates.length === 1) {
      return candidates[0];
    }

    // Try matching first name parts
    const firstNameParts = firstName.split(/\s+/);
    for (const part of firstNameParts) {
      candidate = await prisma.candidate.findFirst({
        where: {
          isDeleted: false,
          firstName: { contains: part, mode: 'insensitive' },
          lastName: { contains: lastName, mode: 'insensitive' },
        },
      });

      if (candidate) {
        return candidate;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error finding candidate for ${firstName} ${lastName}:`, error);
    return null;
  }
}

/**
 * Import a single CV file
 */
async function importCV(filename: string): Promise<ImportResult> {
  const result: ImportResult = {
    filename,
    success: false,
  };

  try {
    // Parse filename
    const parsed = parseFilename(filename);
    if (!parsed) {
      result.error = 'Could not parse filename';
      return result;
    }

    const { firstName, lastName } = parsed;

    // Find candidate
    const candidate = await findCandidateByName(firstName, lastName);
    if (!candidate) {
      result.error = `No candidate found for ${firstName} ${lastName}`;
      return result;
    }

    result.candidateId = candidate.id;
    result.candidateName = `${candidate.firstName} ${candidate.lastName}`;

    // Check if candidate already has a CV
    if (candidate.cvStoragePath) {
      console.log(
        `⚠️  Candidate ${result.candidateName} already has a CV, skipping...`
      );
      result.error = 'Candidate already has a CV';
      return result;
    }

    // Copy file to destination
    const sourcePath = path.join(SOURCE_DIR, filename);
    const timestamp = Date.now();
    const ext = path.extname(filename);
    const destFilename = `${candidate.id}_${timestamp}${ext}`;
    const destPath = path.join(DEST_DIR, destFilename);

    fs.copyFileSync(sourcePath, destPath);

    // Update database
    const cvStoragePath = `uploads/cvs/${destFilename}`;
    const cvUrl = `/api/candidates/${candidate.id}/cv/download`;

    await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        cvUrl,
        cvStoragePath,
      },
    });

    result.success = true;
    console.log(
      `✅ Imported CV for ${result.candidateName} (${candidate.id})`
    );

    return result;
  } catch (error: any) {
    result.error = error.message;
    console.error(`❌ Error importing ${filename}:`, error);
    return result;
  }
}

/**
 * Main import function
 */
async function importAllCVs() {
  console.log('🚀 Starting CV import...\n');
  console.log(`Source directory: ${SOURCE_DIR}`);
  console.log(`Destination directory: ${DEST_DIR}\n`);

  try {
    // Read all files from source directory
    const files = fs
      .readdirSync(SOURCE_DIR)
      .filter((file) => file.toLowerCase().endsWith('.pdf'));

    console.log(`Found ${files.length} PDF files to import\n`);

    const results: ImportResult[] = [];

    // Import each file
    for (const file of files) {
      const result = await importCV(file);
      results.push(result);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 IMPORT SUMMARY');
    console.log('='.repeat(60) + '\n');

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    console.log(`✅ Successfully imported: ${successful.length}`);
    console.log(`❌ Failed to import: ${failed.length}`);
    console.log(`📁 Total files: ${results.length}\n`);

    if (failed.length > 0) {
      console.log('Failed imports:');
      failed.forEach((result) => {
        console.log(`  - ${result.filename}: ${result.error}`);
      });
    }

    console.log('\n✨ Import completed!\n');
  } catch (error) {
    console.error('Fatal error during import:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
importAllCVs();
