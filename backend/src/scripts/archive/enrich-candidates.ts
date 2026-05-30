import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXCEL_FILE_PATH = 'C:\\Recrutement\\Grille d\'entretiens xguard.security (1).xlsx';

// Normalize text for comparison
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate similarity score
function similarity(s1: string, s2: string): number {
  const norm1 = normalize(s1);
  const norm2 = normalize(s2);

  if (norm1 === norm2) return 100;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 90;

  const words1 = norm1.split(' ');
  const words2 = norm2.split(' ');

  const shorter = words1.length < words2.length ? words1 : words2;
  const longer = words1.length < words2.length ? words2 : words1;

  let matchCount = 0;
  for (const word of shorter) {
    if (longer.some(w => w.includes(word) || word.includes(w))) {
      matchCount++;
    }
  }

  return (matchCount / shorter.length) * 100;
}

// Parse rating from Excel (e.g., "8/10" -> 8, "8,5/10" -> 8.5)
function parseRating(ratingValue: any): number | null {
  if (!ratingValue) return null;

  const str = String(ratingValue).trim();

  // Handle "ABS" or "absent" cases
  if (str.toLowerCase().includes('abs')) return null;

  // Extract number before /10
  const match = str.match(/([0-9,\.]+)\s*\/\s*10/);
  if (match) {
    const num = match[1].replace(',', '.');
    const rating = parseFloat(num);
    return isNaN(rating) ? null : rating;
  }

  return null;
}

async function enrichCandidates() {
  console.log('🔄 Enrichissement des candidats avec les données Excel...\n');

  try {
    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const summarySheet = workbook.Sheets['Récapitulatif xguard '];
    const summaryData = XLSX.utils.sheet_to_json(summarySheet) as any[];

    const allCandidates = await prisma.candidate.findMany({
      where: { isDeleted: false },
    });

    console.log(`📊 Candidats à enrichir: ${allCandidates.length}\n`);

    let updated = 0;
    let enrichedWithRating = 0;
    let enrichedWithHrNotes = 0;
    let enrichedWithVideo = 0;
    let enrichedWithEmail = 0;
    let enrichedWithPhone = 0;

    for (const candidate of allCandidates) {
      const fullName = `${candidate.firstName} ${candidate.lastName}`;

      // Find best match in Excel
      let bestMatch = null;
      let bestScore = 0;

      for (const row of summaryData) {
        const nomPrenoms = row['Nom & prénoms'];
        if (!nomPrenoms) continue;

        const score = similarity(fullName, nomPrenoms);

        if (score > bestScore) {
          bestScore = score;
          bestMatch = row;
        }
      }

      if (!bestMatch || bestScore < 70) {
        console.log(`⚠️  Pas de correspondance pour: ${fullName} (meilleur score: ${bestScore.toFixed(0)}%)`);
        continue;
      }

      // Prepare update data
      const updateData: any = {};
      let hasUpdates = false;
      const updates: string[] = [];

      // 1. Global Rating
      if (!candidate.globalRating && bestMatch['Note']) {
        const rating = parseRating(bestMatch['Note']);
        if (rating !== null) {
          updateData.globalRating = rating;
          enrichedWithRating++;
          updates.push(`Note: ${rating}/10`);
          hasUpdates = true;
        }
      }

      // 2. HR Notes (Avis RH)
      if (!candidate.hrNotes && bestMatch['Avis RH']) {
        const hrNotes = String(bestMatch['Avis RH']).trim();
        if (hrNotes && hrNotes !== 'undefined') {
          updateData.hrNotes = hrNotes;
          enrichedWithHrNotes++;
          updates.push('Avis RH');
          hasUpdates = true;
        }
      }

      // 3. Video URL
      if (!candidate.videoUrl && bestMatch['Vidéo d\'entrevue']) {
        const videoUrl = String(bestMatch['Vidéo d\'entrevue']).trim();
        if (videoUrl && videoUrl !== 'undefined') {
          updateData.videoUrl = videoUrl;
          enrichedWithVideo++;
          updates.push('Vidéo');
          hasUpdates = true;
        }
      }

      // 4. Email
      if (!candidate.email && bestMatch['Adresse mail']) {
        const email = String(bestMatch['Adresse mail']).trim();
        if (email && email !== 'undefined' && email.includes('@')) {
          updateData.email = email;
          enrichedWithEmail++;
          updates.push('Email');
          hasUpdates = true;
        }
      }

      // 5. Phone
      if (!candidate.phone && bestMatch['Contact']) {
        const phone = String(bestMatch['Contact']).trim();
        if (phone && phone !== 'undefined') {
          updateData.phone = phone;
          enrichedWithPhone++;
          updates.push('Téléphone');
          hasUpdates = true;
        }
      }

      if (hasUpdates) {
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: updateData,
        });

        console.log(`✅ ${updated + 1}. ${fullName} - Enrichi avec: ${updates.join(', ')}`);
        updated++;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📈 RÉSUMÉ');
    console.log('='.repeat(80));
    console.log(`✅ Candidats mis à jour: ${updated}`);
    console.log(`📊 Notes globales ajoutées: ${enrichedWithRating}`);
    console.log(`💬 Avis RH ajoutés: ${enrichedWithHrNotes}`);
    console.log(`🎥 Vidéos ajoutées: ${enrichedWithVideo}`);
    console.log(`📧 Emails ajoutés: ${enrichedWithEmail}`);
    console.log(`📱 Téléphones ajoutés: ${enrichedWithPhone}`);
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

enrichCandidates();
