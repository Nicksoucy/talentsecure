import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

// Use environment variable or command line argument for CV source directory
const CV_SOURCE_DIR = process.env.CV_SOURCE_DIR || process.argv[2] || path.join(process.cwd(), '../cv candidats');
const CV_DEST_DIR = path.join(__dirname, '../../uploads/cv');

// Fonction pour nettoyer et normaliser les noms
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Enlever les accents
    .replace(/[^a-z0-9\s]/g, '') // Garder seulement lettres, chiffres et espaces
    .replace(/\s+/g, ' ') // Normaliser les espaces
    .trim();
}

// Fonction pour extraire prénom et nom du fichier
function extractNameFromFilename(filename: string): { firstName: string; lastName: string } | null {
  // Enlever l'extension .pdf
  const nameWithoutExt = filename.replace(/\.pdf$/i, '');

  // Enlever le numéro au début (format: "10-Nom Prenom")
  const nameWithoutNumber = nameWithoutExt.replace(/^\d+-/, '').trim();

  // Séparer par espaces
  const parts = nameWithoutNumber.split(/\s+/);

  if (parts.length < 2) {
    return null;
  }

  // Le premier mot est généralement le prénom, le reste est le nom
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');

  return { firstName, lastName };
}

async function linkCVs() {
  try {
    console.log('🔗 Début de l\'association des CVs...\n');

    // Créer le dossier de destination s'il n'existe pas
    if (!fs.existsSync(CV_DEST_DIR)) {
      fs.mkdirSync(CV_DEST_DIR, { recursive: true });
      console.log(`📁 Dossier créé: ${CV_DEST_DIR}\n`);
    }

    // Lire tous les fichiers PDF du dossier source
    const files = fs.readdirSync(CV_SOURCE_DIR).filter(file => file.toLowerCase().endsWith('.pdf'));

    console.log(`📄 ${files.length} fichiers CV trouvés\n`);

    let successCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;

    for (const file of files) {
      const sourcePath = path.join(CV_SOURCE_DIR, file);

      try {
        // Extraire le nom du fichier
        const nameInfo = extractNameFromFilename(file);

        if (!nameInfo) {
          console.log(`⚠️  Impossible d'extraire le nom de: ${file}`);
          errorCount++;
          continue;
        }

        const { firstName, lastName } = nameInfo;

        // Chercher le candidat dans la base de données
        // On cherche avec une correspondance flexible
        const candidates = await prisma.candidate.findMany({
          where: {
            isDeleted: false,
            OR: [
              {
                AND: [
                  { firstName: { contains: firstName, mode: 'insensitive' } },
                  { lastName: { contains: lastName, mode: 'insensitive' } },
                ],
              },
              {
                AND: [
                  { firstName: { contains: lastName, mode: 'insensitive' } },
                  { lastName: { contains: firstName, mode: 'insensitive' } },
                ],
              },
            ],
          },
        });

        if (candidates.length === 0) {
          console.log(`❌ Candidat non trouvé pour: ${file} (${firstName} ${lastName})`);
          notFoundCount++;
          continue;
        }

        if (candidates.length > 1) {
          console.log(`⚠️  Plusieurs candidats trouvés pour: ${file}`);
          candidates.forEach(c => console.log(`   - ${c.firstName} ${c.lastName} (${c.id})`));
          // On prend le premier pour l'instant
        }

        const candidate = candidates[0];

        // Créer un nom de fichier unique et sécurisé
        const sanitizedFileName = `${candidate.id}_${normalizeName(candidate.firstName)}_${normalizeName(candidate.lastName)}.pdf`;
        const destPath = path.join(CV_DEST_DIR, sanitizedFileName);

        // Copier le fichier
        fs.copyFileSync(sourcePath, destPath);

        // Mettre à jour la base de données
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            cvStoragePath: sanitizedFileName,
          },
        });

        console.log(`✅ ${file} → ${candidate.firstName} ${candidate.lastName}`);
        successCount++;

      } catch (error: any) {
        console.log(`❌ Erreur pour ${file}: ${error.message}`);
        errorCount++;
      }
    }

    console.log('\n📊 Résumé:');
    console.log(`   ✅ CVs associés avec succès: ${successCount}`);
    console.log(`   ❌ Candidats non trouvés: ${notFoundCount}`);
    console.log(`   ⚠️  Erreurs: ${errorCount}`);

  } catch (error) {
    console.error('❌ Erreur générale:', error);
  } finally {
    await prisma.$disconnect();
  }
}

linkCVs();
