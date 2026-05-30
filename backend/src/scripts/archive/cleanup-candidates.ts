import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Liste des 97 emails actuels de l'Excel
const currentEmails = [
  "jeannbonda@gmail.com",
  "minouemike@gmail.com",
  "emandavies6@gmail.com",
  "abdourahmanes469@gmail.com",
  "ambrogaston@gmail.com",
  "signembefrancklin@gmail.com",
  "ylare87@gmail.com",
  "elhadjhamidoud002@gmail.com",
  "hamaradiame482@gmail.com",
  "manangajustin7@gmail.com",
  "luc_658@hotmail.com",
  "kachache1@outlook.com",
  "alsenycoman29@gmail.com",
  "dieudonnisedeclee@gmail.com",
  "marc.bedard.vy@outlook.com",
  "longinbaranyizigiye@gmail.com",
  "hbadi2005@gmail.com",
  "jefflubin2013@yahoo.fr",
  "oubelaidyacine91@gmail.com",
  "ladivamyrielle@gmail.com",
  "nagueernest@yahoo.fr",
  "bornelus4@gmail.com",
  "douanlagualbert@gmail.com",
  "oumardjiguiba0893@gmail.com",
  "judicaeltchapda5@gmail.com",
  "lamanalaversion@gmail.com",
  "jeanpaulbandusha@gmail.com",
  "elhadjeguiladjo@gmail.com",
  "adelkachmir1996@gmail.com",
  "maevaharris2022@gmail.com",
  "robertdesir384@gmail.com",
  "akakpo08@gmail.com",
  "abdouchafiahmat9@gmail.com",
  "delimanou528@gmail.com",
  "jonasazor6@gmail.com",
  "charlenemadjoukou@gmail.com",
  "awfall93@gmail.com",
  "enes.laalaa06@gmail.com",
  "stephanierfils@gmail.com",
  "atonnanghermann@gmail.com",
  "gbogoujeanaime0@gmail.com",
  "pierrilusrubens@gmail.com",
  "nanaleonel563@gmail.com",
  "willboxe@outlook.com",
  "gontrandugal9@outlook.com",
  "mic069994@gmail.com",
  "gamalmohamedadammusa@gmail.com",
  "tsafihocho8@gmail.com",
  "giovannyana90@gmail.com",
  "kitsakatumbelu@gmail.com",
  "ryma2994@outlook.com",
  "jennyfer4646@gmail.com",
  "mathymoussa2@gmail.com",
  "mddian2009@gmail.com",
  "youssef.bencherife@gmail.com",
  "eustachengoundjo@gmail.com",
  "kpadenougide@gmail.com",
  "calvindeutoukadji@gmail.com",
  "t.bearr@hotmail.com",
  "sierratango727@gmail.com",
  "lyfa0091@gmail.com",
  "samueldesgagne@gmail.com",
  "foftm8@icloud.com",
  "cmohamedlamine517@gmail.com",
  "oceanelgendron@gmail.com",
  "mbambafaustin@yahoo.ca",
  "bonixnoubissi@gmail.com",
  "dhawa268@gmail.com",
  "babacarmar1998@gmail.com",
  "djamelluz@gmail.com",
  "konagboumemy9@gmail.com",
  "touclanidjetoh@gmail.com",
  "",  // Pas d'email pour Mamadou Saliou Diallo (ligne 73)
  "maximeruelcharbonneau@gmail.com",
  "abdramaneniambele29@gmail.com",
  "augusyvan3@gmail.com",
  "aurielatouou2018@gmail.com",
  "pierrepaulatemfack@gmail.com",
  "touclanidjetoh@gmail.com",  // Duplicate
  "davidgasleycius@gmail.com",
  "usow94@gmail.com",
  "kinzaidir06@gmail.com",
  "kouameadelaide225@gmail.com",
  "frandysaintjeanmadara@gmail.com",
  "juniaducarly01@gmail.com",
  "jeanpierreraymond13@gmail.com",
  "hounnoukpelennox@gmail.com",
  "midlherj@gmail.com",
  "mamadoudianbarry441thiedeee@gmail.com",
  "alineflore1979@yahoo.com",
  "harislakhani99@hotmail.com",
  "jeanguylauture@gmail.com",
  "frismanmartinez34@gmail.com",
  "ezeddinebouaziz@gmail.com",
  "moreltchameni@gmail.com",
  "alexandre.tallec01@gmail.com",
  "chamberlindjedje@gmail.com",
].filter(email => email !== ''); // Remove empty emails

async function cleanupCandidates() {
  try {
    console.log('🧹 Nettoyage de la base de données...\n');

    // Get all candidates
    const allCandidates = await prisma.candidate.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      }
    });

    console.log(`Total de candidats actuels: ${allCandidates.length}`);
    console.log(`Candidats à conserver (Excel): ${currentEmails.length}\n`);

    // Find candidates to delete (not in current list)
    const toDelete = allCandidates.filter(c =>
      !currentEmails.some(email =>
        email.toLowerCase() === (c.email?.toLowerCase() || '')
      )
    );

    console.log(`Candidats à supprimer: ${toDelete.length}\n`);

    if (toDelete.length > 0) {
      console.log('🗑️  Suppression des anciens candidats...\n');

      let deletedCount = 0;
      for (const candidate of toDelete) {
        try {
          // Delete related records first
          await prisma.candidateLanguage.deleteMany({ where: { candidateId: candidate.id } });
          await prisma.candidateAvailability.deleteMany({ where: { candidateId: candidate.id } });
          await prisma.candidateExperience.deleteMany({ where: { candidateId: candidate.id } });
          await prisma.candidateCertification.deleteMany({ where: { candidateId: candidate.id } });
          await prisma.candidateSituationTest.deleteMany({ where: { candidateId: candidate.id } });
          await prisma.catalogueItem.deleteMany({ where: { candidateId: candidate.id } });

          // Delete the candidate
          await prisma.candidate.delete({ where: { id: candidate.id } });

          console.log(`✅ Supprimé: ${candidate.firstName} ${candidate.lastName} (${candidate.email})`);
          deletedCount++;
        } catch (error) {
          console.error(`❌ Erreur pour ${candidate.email}:`, error);
        }
      }

      console.log(`\n✅ ${deletedCount} candidats supprimés`);
    }

    // Verify remaining candidates
    const remainingCandidates = await prisma.candidate.count();
    console.log(`\n📊 Candidats restants: ${remainingCandidates}`);

    // Check which candidates from Excel are missing
    const remaining = await prisma.candidate.findMany({
      select: { email: true }
    });

    const remainingEmails = remaining.map(c => c.email?.toLowerCase());
    const missingEmails = currentEmails.filter(email =>
      !remainingEmails.includes(email.toLowerCase())
    );

    if (missingEmails.length > 0) {
      console.log(`\n⚠️  Candidats manquants (${missingEmails.length}):`);
      missingEmails.forEach(email => console.log(`  - ${email}`));
    } else {
      console.log('\n✅ Tous les candidats de l\'Excel sont présents !');
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanupCandidates();
