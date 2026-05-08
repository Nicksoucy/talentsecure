import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

/**
 * Normalize a string for comparison (lowercase, remove accents, special chars)
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]/g, ''); // Keep only alphanumeric
}

/**
 * Calculate similarity score between two strings (0-1)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeString(str1);
  const norm2 = normalizeString(str2);

  // Exact match
  if (norm1 === norm2) return 1.0;

  // Check if one contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return 0.8;
  }

  // Calculate Levenshtein distance ratio
  const longer = norm1.length > norm2.length ? norm1 : norm2;
  const shorter = norm1.length > norm2.length ? norm2 : norm1;

  if (longer.length === 0) return 1.0;

  // Simple substring scoring
  let matches = 0;
  for (let i = 0; i < shorter.length - 2; i++) {
    const trigram = shorter.substring(i, i + 3);
    if (longer.includes(trigram)) {
      matches++;
    }
  }

  return matches / Math.max(1, shorter.length - 2);
}

/**
 * Extract name from filename
 * Examples:
 *   "uuid_gilbert_kambale mbeku.pdf" -> "gilbert kambale mbeku"
 *   "022f_john_doe.pdf" -> "john doe"
 */
function extractNameFromFilename(filename: string): string {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.(pdf|docx?|png|jpe?g)$/i, '');

  // Remove UUID prefix if present (36 chars + underscore)
  const withoutUuid = nameWithoutExt.replace(/^[a-f0-9\-]{36}_/i, '');

  // Replace underscores with spaces
  const nameWithSpaces = withoutUuid.replace(/_/g, ' ');

  return nameWithSpaces.trim();
}

async function migrateCVPaths() {
  console.log('=== CV PATH MIGRATION SCRIPT ===\n');

  const uploadsPath = path.join(__dirname, 'uploads', 'cv');

  // Get all CV files (PDF, Word, Images)
  const allFiles = fs.readdirSync(uploadsPath);
  const cvFiles = allFiles.filter(f =>
    /\.(pdf|docx?|png|jpe?g)$/i.test(f)
  );

  console.log(`Found ${cvFiles.length} CV files in uploads/cv:`);
  console.log(`  - PDF: ${cvFiles.filter(f => /\.pdf$/i.test(f)).length}`);
  console.log(`  - Word: ${cvFiles.filter(f => /\.docx?$/i.test(f)).length}`);
  console.log(`  - Images: ${cvFiles.filter(f => /\.(png|jpe?g)$/i.test(f)).length}`);
  console.log('');

  // Get all prospects without converted or deleted
  const prospects = await prisma.prospectCandidate.findMany({
    where: {
      isDeleted: false,
      isConverted: false
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      cvStoragePath: true
    }
  });

  console.log(`Found ${prospects.length} active prospects in database\n`);

  const matches: Array<{
    prospectId: string;
    prospectName: string;
    fileName: string;
    similarity: number;
    currentPath: string | null;
  }> = [];

  // Try to match each file to a prospect
  for (const file of cvFiles) {
    const fileNameExtracted = extractNameFromFilename(file);

    let bestMatch: typeof matches[0] | null = null;
    let bestScore = 0;

    for (const prospect of prospects) {
      const prospectName = `${prospect.firstName} ${prospect.lastName}`;
      const similarity = calculateSimilarity(prospectName, fileNameExtracted);

      if (similarity > bestScore && similarity > 0.5) { // Threshold: 50%
        bestScore = similarity;
        bestMatch = {
          prospectId: prospect.id,
          prospectName,
          fileName: file,
          similarity,
          currentPath: prospect.cvStoragePath
        };
      }
    }

    if (bestMatch) {
      matches.push(bestMatch);
    }
  }

  console.log(`\n=== MATCHING RESULTS ===`);
  console.log(`Found ${matches.length} potential matches\n`);

  // Sort by similarity (best matches first)
  matches.sort((a, b) => b.similarity - a.similarity);

  // Display matches
  console.log('Top matches:');
  matches.slice(0, 10).forEach((match, i) => {
    const score = (match.similarity * 100).toFixed(0);
    console.log(`${i + 1}. ${match.prospectName} -> ${match.fileName}`);
    console.log(`   Similarity: ${score}% | Current path: ${match.currentPath || 'none'}`);
  });

  console.log('\n');

  // Ask for confirmation (in real usage, you'd prompt the user)
  const proceedWithUpdate = true; // Set to true to auto-update

  if (proceedWithUpdate) {
    console.log('Updating database...\n');

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const match of matches) {
      try {
        // Only update if similarity is high enough
        if (match.similarity >= 0.7) {
          await prisma.prospectCandidate.update({
            where: { id: match.prospectId },
            data: {
              cvStoragePath: match.fileName // Store just the filename
            }
          });

          console.log(`✓ Updated: ${match.prospectName} -> ${match.fileName}`);
          updated++;
        } else {
          console.log(`⊘ Skipped (low confidence ${(match.similarity * 100).toFixed(0)}%): ${match.prospectName}`);
          skipped++;
        }
      } catch (error: any) {
        console.log(`✗ Error updating ${match.prospectName}: ${error.message}`);
        errors++;
      }
    }

    console.log(`\n=== MIGRATION SUMMARY ===`);
    console.log(`✓ Updated: ${updated}`);
    console.log(`⊘ Skipped (low confidence): ${skipped}`);
    console.log(`✗ Errors: ${errors}`);
    console.log(`Remaining prospects without CV: ${prospects.length - updated}`);
  } else {
    console.log('Migration cancelled. No changes made.');
  }

  await prisma.$disconnect();
}

migrateCVPaths()
  .then(() => {
    console.log('\n✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
