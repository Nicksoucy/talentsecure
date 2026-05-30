import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import path from 'path';

const prisma = new PrismaClient();

// Mapping des villes exactes depuis votre Excel
const cityMapping: { [key: string]: string } = {
  "jeannbonda@gmail.com": "Québec",
  "minouemike@gmail.com": "Québec",
  "emandavies6@gmail.com": "Québec",
  "abdourahmanes469@gmail.com": "Montréal",
  "ambrogaston@gmail.com": "Québec",
  "signembefrancklin@gmail.com": "Montréal",
  "ylare87@gmail.com": "Longueuil",
  "elhadjhamidoud002@gmail.com": "Montréal",
  "hamaradiame482@gmail.com": "Montréal",
  "manangajustin7@gmail.com": "Montréal",
  "luc_658@hotmail.com": "Drommundoville",
  "kachache1@outlook.com": "Montréal",
  "alsenycoman29@gmail.com": "Montréal",
  "dieudonnisedeclee@gmail.com": "Laval",
  "marc.bedard.vy@outlook.com": "Salaberry-de-Valleyfield",
  "longinbaranyizigiye@gmail.com": "Montréal",
  "hbadi2005@gmail.com": "Laval",
  "jefflubin2013@yahoo.fr": "Montréal",
  "oubelaidyacine91@gmail.com": "Gatineau",
  "ladivamyrielle@gmail.com": "Ottawa",
  "nagueernest@yahoo.fr": "Québec",
  "bornelus4@gmail.com": "",
  "douanlagualbert@gmail.com": "Québec",
  "oumardjiguiba0893@gmail.com": "Sherbrooke",
  "judicaeltchapda5@gmail.com": "Québec",
  "lamanalaversion@gmail.com": "Gatineau",
  "jeanpaulbandusha@gmail.com": "Laval",
  "elhadjeguiladjo@gmail.com": "Montréal",
  "adelkachmir1996@gmail.com": "",
  "maevaharris2022@gmail.com": "Longueuil",
  "robertdesir384@gmail.com": "La Tuque",
  "akakpo08@gmail.com": "Québec",
  "abdouchafiahmat9@gmail.com": "Québec",
  "delimanou528@gmail.com": "",
  "jonasazor6@gmail.com": "Québec",
  "charlenemadjoukou@gmail.com": "Gatineau",
  "awfall93@gmail.com": "",
  "enes.laalaa06@gmail.com": "Laval",
  "stephanierfils@gmail.com": "Montréal",
  "atonnanghermann@gmail.com": "Gatineau",
  "gbogoujeanaime0@gmail.com": "Montréal",
  "pierrilusrubens@gmail.com": "",
  "nanaleonel563@gmail.com": "Montréal",
  "willboxe@outlook.com": "Saint Aimable",
  "gontrandugal9@outlook.com": "Cantonville",
  "mic069994@gmail.com": "Longueuil",
  "gamalmohamedadammusa@gmail.com": "",
  "tsafihocho8@gmail.com": "Montréal",
  "giovannyana90@gmail.com": "",
  "kitsakatumbelu@gmail.com": "Québec",
  "ryma2994@outlook.com": "Montréal",
  "jennyfer4646@gmail.com": "Montréal",
  "mathymoussa2@gmail.com": "Montréal",
  "mddian2009@gmail.com": "Montréal",
  "youssef.bencherife@gmail.com": "Laval",
  "eustachengoundjo@gmail.com": "Québec",
  "kpadenougide@gmail.com": "Longueuil",
  "calvindeutoukadji@gmail.com": "Québec",
  "t.bearr@hotmail.com": "Montréal",
  "sierratango727@gmail.com": "Montréal",
  "lyfa0091@gmail.com": "Québec",
  "samueldesgagne@gmail.com": "Lac-Saint-Jean",
  "foftm8@icloud.com": "Montréal",
  "cmohamedlamine517@gmail.com": "Gatineau",
  "oceanelgendron@gmail.com": "Ste Agathe-des-Monts",
  "mbambafaustin@yahoo.ca": "",
  "bonixnoubissi@gmail.com": "Rive-Sud",
  "dhawa268@gmail.com": "Saint-Basile-le-Grand",
  "babacarmar1998@gmail.com": "",
  "djamelluz@gmail.com": "Montréal",
  "konagboumemy9@gmail.com": "",
  "touclanidjetoh@gmail.com": "Val-d'or",
  "maximeruelcharbonneau@gmail.com": "",
  "abdramaneniambele29@gmail.com": "",
  "augusyvan3@gmail.com": "Sherbrook",
  "aurielatouou2018@gmail.com": "Québec",
  "pierrepaulatemfack@gmail.com": "Trois-Rivières",
  "davidgasleycius@gmail.com": "Québec",
  "usow94@gmail.com": "Montréal",
  "kinzaidir06@gmail.com": "Montréal",
  "kouameadelaide225@gmail.com": "",
  "frandysaintjeanmadara@gmail.com": "Montréal",
  "juniaducarly01@gmail.com": "Montréal",
  "jeanpierreraymond13@gmail.com": "Montréal",
  "hounnoukpelennox@gmail.com": "Montréal",
  "midlherj@gmail.com": "Montréal",
  "mamadoudianbarry441thiedeee@gmail.com": "",
  "alineflore1979@yahoo.com": "",
  "harislakhani99@hotmail.com": "",
  "jeanguylauture@gmail.com": "Montréal",
  "frismanmartinez34@gmail.com": "",
  "ezeddinebouaziz@gmail.com": "Montréal",
  "moreltchameni@gmail.com": "Québec",
  "alexandre.tallec01@gmail.com": "Québec",
  "chamberlindjedje@gmail.com": "Montréal",
};

async function importAllCandidates() {
  try {
    // Get system user
    const systemUser = await prisma.user.findUnique({
      where: { email: 'system@talentsecure.com' }
    });

    if (!systemUser) {
      throw new Error('System user not found. Please run create-system-user.ts first.');
    }

    console.log('📖 Lecture complète du fichier Excel...\n');

    const excelPath = path.join('C:', 'Recrutement', "Grille d'entretiens xguard.security (1).xlsx");
    const workbook = XLSX.readFile(excelPath);

    let sheetName = workbook.SheetNames.find(name =>
      name.toLowerCase().includes('récapitulatif') ||
      name.toLowerCase().includes('recapitulatif')
    );

    if (!sheetName) {
      sheetName = workbook.SheetNames[0];
    }

    console.log(`✅ Feuille: ${sheetName}\n`);

    const worksheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const headers = data[0] as string[];
    console.log('📋 Colonnes disponibles:', headers);
    console.log(`\n📊 Total de lignes: ${data.length - 1}\n`);

    // Indices des colonnes
    const COL_NOM = 1;        // "Nom & prénoms"
    const COL_EMAIL = 2;      // "Adresse mail"
    const COL_PHONE = 3;      // "Contact"
    const COL_VILLE = 4;      // "Ville"
    const COL_DATE = 5;       // "Date d'entretien"
    const COL_NOTE = 6;       // "Note"
    const COL_AVIS_RH = 9;    // "Avis RH"

    let imported = 0;
    let skipped = 0;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) {
        skipped++;
        continue;
      }

      try {
        const fullName = row[COL_NOM]?.toString().trim();
        const email = row[COL_EMAIL]?.toString().trim();
        const phone = row[COL_PHONE]?.toString().trim() || 'N/A';
        let city = row[COL_VILLE]?.toString().trim() || '';
        const dateStr = row[COL_DATE]?.toString().trim();
        const noteStr = row[COL_NOTE]?.toString().trim();
        const avisRH = row[COL_AVIS_RH]?.toString().trim() || '';

        if (!fullName) {
          console.log(`⚠️  Ligne ${i + 1}: Pas de nom, ignoré`);
          skipped++;
          continue;
        }

        // Parse name
        let firstName = '';
        let lastName = '';

        if (fullName.includes(',')) {
          const parts = fullName.split(',').map(p => p.trim());
          lastName = parts[0];
          firstName = parts[1] || '';
        } else {
          const parts = fullName.split(' ').filter(p => p);
          if (parts.length >= 2) {
            firstName = parts[0];
            lastName = parts.slice(1).join(' ');
          } else {
            firstName = parts[0] || 'Unknown';
            lastName = parts[0] || 'Unknown';
          }
        }

        // Use city mapping
        if (email && cityMapping[email.toLowerCase()]) {
          city = cityMapping[email.toLowerCase()];
        }
        if (!city || city === 'N/A') city = '';

        // Parse date
        let interviewDate: Date | null = null;
        if (dateStr && dateStr !== 'ABS') {
          try {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
              interviewDate = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
            }
          } catch (e) {
            // Ignore date errors
          }
        }

        // Parse note
        let globalRating: number | null = null;
        if (noteStr && noteStr !== 'ABS') {
          const match = noteStr.match(/(\d+(?:,\d+)?)\s*\/\s*10/);
          if (match) {
            globalRating = parseFloat(match[1].replace(',', '.'));
          }
        }

        // Determine status
        let status = 'EN_ATTENTE';
        if (globalRating) {
          if (globalRating >= 9.5) status = 'ELITE';
          else if (globalRating >= 8.5) status = 'EXCELLENT';
          else if (globalRating >= 7.5) status = 'TRES_BON';
          else if (globalRating >= 6.5) status = 'BON';
          else if (globalRating >= 5) status = 'QUALIFIE';
        }

        // Create candidate
        await prisma.candidate.create({
          data: {
            firstName,
            lastName,
            email: email || null,
            phone,
            city: city || 'N/A',
            status: status as any,
            globalRating,
            interviewDate,
            hrNotes: avisRH || null,
            createdById: systemUser.id,
            // Defaults
            hasVehicle: false,
            hasBSP: false,
            hasDriverLicense: false,
            canWorkUrgent: false,
            isActive: true,
            isDeleted: false,
          },
        });

        console.log(`✅ ${firstName} ${lastName} (${email || 'pas d\'email'}) - ${city || 'pas de ville'} - ${globalRating ? globalRating + '/10' : 'pas de note'}`);
        imported++;

      } catch (error) {
        console.error(`❌ Erreur ligne ${i + 1}:`, error);
        skipped++;
      }
    }

    console.log(`\n✅ Import terminé!`);
    console.log(`   - ${imported} candidats importés`);
    console.log(`   - ${skipped} lignes ignorées`);

    const total = await prisma.candidate.count();
    console.log(`   - ${total} candidats dans la base\n`);

  } catch (error) {
    console.error('❌ Erreur:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

importAllCandidates();
