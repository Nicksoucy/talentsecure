import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import path from 'path';

const prisma = new PrismaClient();

interface CandidateCity {
  firstName?: string;
  lastName?: string;
  email?: string;
  city: string;
}

async function updateCities() {
  try {
    console.log('📖 Lecture du fichier Excel...');

    const excelPath = path.join('C:', 'Recrutement', "Grille d'entretiens xguard.security (1).xlsx");
    const workbook = XLSX.readFile(excelPath);

    // Find the "Récapitulatif xguard" sheet
    let sheetName = workbook.SheetNames.find(name =>
      name.toLowerCase().includes('récapitulatif') ||
      name.toLowerCase().includes('recapitulatif')
    );

    if (!sheetName) {
      console.log('📋 Feuilles disponibles:', workbook.SheetNames);
      sheetName = workbook.SheetNames[0]; // Use first sheet if not found
      console.log(`⚠️  Feuille "Récapitulatif" non trouvée, utilisation de: ${sheetName}`);
    } else {
      console.log(`✅ Feuille trouvée: ${sheetName}`);
    }

    const worksheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    console.log(`📊 Nombre de lignes: ${data.length}`);
    console.log('📝 En-têtes:', data[0]);

    // Find column indices
    const headers = data[0] as string[];
    const nameCol = headers.findIndex(h =>
      h && (h.toLowerCase().includes('nom') && h.toLowerCase().includes('prénom'))
    );
    const emailCol = headers.findIndex(h =>
      h && h.toLowerCase().includes('mail') && !h.toLowerCase().includes('link')
    );
    const cityCol = 4; // Column E (index 4)

    console.log(`\n🔍 Colonnes identifiées:`);
    console.log(`   Nom & Prénom: colonne ${nameCol} (${headers[nameCol]})`);
    console.log(`   Email: colonne ${emailCol} (${headers[emailCol]})`);
    console.log(`   Ville: colonne ${cityCol} (${headers[cityCol]})`);

    const candidatesWithCities: CandidateCity[] = [];

    // Start from row 1 (skip header)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      const fullName = row[nameCol]?.toString().trim();
      const email = row[emailCol]?.toString().trim();
      const city = row[cityCol]?.toString().trim();

      // Skip if no city or city is N/A or empty
      if (!city || city === 'N/A' || city === 'n/a' || city.trim() === '') continue;

      // Parse names for fallback matching
      let firstName = '';
      let lastName = '';

      if (fullName) {
        if (fullName.includes(',')) {
          // Format: "LastName, FirstName"
          const parts = fullName.split(',').map(p => p.trim());
          lastName = parts[0];
          firstName = parts[1] || '';
        } else {
          // Format: "FirstName LastName" or "FirstName MiddleName LastName"
          const parts = fullName.split(' ').filter(p => p);
          if (parts.length >= 2) {
            firstName = parts[0];
            lastName = parts.slice(1).join(' ');
          } else if (parts.length === 1) {
            firstName = parts[0];
            lastName = parts[0];
          }
        }
      }

      // Add to list if we have email or both names
      if (email || (firstName && lastName)) {
        candidatesWithCities.push({
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          email: email || undefined,
          city
        });
      }
    }

    console.log(`\n📋 Candidats avec ville trouvés: ${candidatesWithCities.length}`);
    console.log('\n🔄 Mise à jour de la base de données...\n');

    let updatedCount = 0;
    let notFoundCount = 0;

    for (const candidateData of candidatesWithCities) {
      try {
        let candidate = null;

        // Strategy 1: Try to find by email (most reliable)
        if (candidateData.email) {
          candidate = await prisma.candidate.findFirst({
            where: {
              email: {
                equals: candidateData.email,
                mode: 'insensitive'
              }
            }
          });
        }

        // Strategy 2: Try exact name match
        if (!candidate && candidateData.firstName && candidateData.lastName) {
          candidate = await prisma.candidate.findFirst({
            where: {
              firstName: {
                equals: candidateData.firstName,
                mode: 'insensitive'
              },
              lastName: {
                equals: candidateData.lastName,
                mode: 'insensitive'
              }
            }
          });
        }

        // Strategy 3: Try reversed (firstName <-> lastName)
        if (!candidate && candidateData.firstName && candidateData.lastName) {
          candidate = await prisma.candidate.findFirst({
            where: {
              firstName: {
                equals: candidateData.lastName,
                mode: 'insensitive'
              },
              lastName: {
                equals: candidateData.firstName,
                mode: 'insensitive'
              }
            }
          });
        }

        // Strategy 4: Try partial match on lastName only (for compound names)
        if (!candidate && candidateData.lastName) {
          candidate = await prisma.candidate.findFirst({
            where: {
              OR: [
                {
                  lastName: {
                    contains: candidateData.lastName,
                    mode: 'insensitive'
                  }
                },
                {
                  firstName: {
                    contains: candidateData.lastName,
                    mode: 'insensitive'
                  }
                }
              ]
            }
          });
        }

        if (candidate) {
          await prisma.candidate.update({
            where: { id: candidate.id },
            data: { city: candidateData.city }
          });
          const displayName = candidateData.email
            ? `${candidateData.email}`
            : `${candidateData.firstName} ${candidateData.lastName}`;
          console.log(`✅ ${displayName} -> ${candidateData.city}`);
          updatedCount++;
        } else {
          const displayName = candidateData.email
            ? `${candidateData.email}`
            : `${candidateData.firstName} ${candidateData.lastName}`;
          console.log(`⚠️  Non trouvé: ${displayName}`);
          notFoundCount++;
        }
      } catch (error) {
        const displayName = candidateData.email
          ? `${candidateData.email}`
          : `${candidateData.firstName} ${candidateData.lastName}`;
        console.error(`❌ Erreur pour ${displayName}:`, error);
      }
    }

    console.log(`\n✅ Mise à jour terminée!`);
    console.log(`   - ${updatedCount} candidats mis à jour`);
    console.log(`   - ${notFoundCount} candidats non trouvés`);

  } catch (error) {
    console.error('❌ Erreur:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updateCities();
