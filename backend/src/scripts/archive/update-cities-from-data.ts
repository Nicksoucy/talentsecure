import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Données extraites du message utilisateur
const candidatesData = [
  { email: "jeannbonda@gmail.com", city: "Québec" },
  { email: "minouemike@gmail.com", city: "Québec" },
  { email: "emandavies6@gmail.com", city: "Québec" },
  { email: "abdourahmanes469@gmail.com", city: "Montréal" },
  { email: "ambrogaston@gmail.com", city: "Québec" },
  { email: "signembefrancklin@gmail.com", city: "Montréal" },
  { email: "ylare87@gmail.com", city: "Longueuil" },
  { email: "elhadjhamidoud002@gmail.com", city: "Montréal" },
  { email: "hamaradiame482@gmail.com", city: "Montréal" },
  { email: "manangajustin7@gmail.com", city: "Montréal" },
  { email: "luc_658@hotmail.com", city: "Drommundoville" },
  { email: "kachache1@outlook.com", city: "Montréal" },
  { email: "alsenycoman29@gmail.com", city: "Montréal" },
  { email: "dieudonnisedeclee@gmail.com", city: "Laval" },
  { email: "marc.bedard.vy@outlook.com", city: "Salaberry-de-Valleyfield" },
  { email: "longinbaranyizigiye@gmail.com", city: "Montréal" },
  { email: "hbadi2005@gmail.com", city: "Laval" },
  { email: "jefflubin2013@yahoo.fr", city: "Montréal" },
  { email: "oubelaidyacine91@gmail.com", city: "Gatineau" },
  { email: "ladivamyrielle@gmail.com", city: "Ottawa" },
  { email: "nagueernest@yahoo.fr", city: "Québec" },
  { email: "bornelus4@gmail.com", city: "" }, // Pas de ville
  { email: "douanlagualbert@gmail.com", city: "Québec" },
  { email: "oumardjiguiba0893@gmail.com", city: "Sherbrooke" },
  { email: "judicaeltchapda5@gmail.com", city: "Québec" },
  { email: "lamanalaversion@gmail.com", city: "Gatineau" },
  { email: "jeanpaulbandusha@gmail.com", city: "Laval" },
  { email: "elhadjeguiladjo@gmail.com", city: "Montréal" },
  { email: "adelkachmir1996@gmail.com", city: "" }, // Pas de ville
  { email: "maevaharris2022@gmail.com", city: "Longueuil" },
  { email: "robertdesir384@gmail.com", city: "La Tuque" },
  { email: "akakpo08@gmail.com", city: "Québec" },
  { email: "abdouchafiahmat9@gmail.com", city: "Québec" },
  { email: "delimanou528@gmail.com", city: "" }, // Pas de ville
  { email: "jonasazor6@gmail.com", city: "Québec" },
  { email: "charlenemadjoukou@gmail.com", city: "Gatineau" },
  { email: "awfall93@gmail.com", city: "" }, // Pas de ville
  { email: "enes.laalaa06@gmail.com", city: "Laval" },
  { email: "stephanierfils@gmail.com", city: "Montréal" },
  { email: "atonnanghermann@gmail.com", city: "Gatineau" },
  { email: "gbogoujeanaime0@gmail.com", city: "Montréal" },
  { email: "pierrilusrubens@gmail.com", city: "" }, // Pas de ville
  { email: "nanaleonel563@gmail.com", city: "Montréal" },
  { email: "willboxe@outlook.com", city: "Saint Aimable" },
  { email: "gontrandugal9@outlook.com", city: "Cantonville" },
  { email: "mic069994@gmail.com", city: "Longueuil" },
  { email: "gamalmohamedadammusa@gmail.com", city: "" }, // Pas de ville
  { email: "tsafihocho8@gmail.com", city: "Montréal" },
  { email: "giovannyana90@gmail.com", city: "" }, // Pas de ville
  { email: "kitsakatumbelu@gmail.com", city: "Québec" },
  { email: "ryma2994@outlook.com", city: "Montréal" },
  { email: "jennyfer4646@gmail.com", city: "Montréal" },
  { email: "mathymoussa2@gmail.com", city: "Montréal" },
  { email: "mddian2009@gmail.com", city: "Montréal" },
  { email: "youssef.bencherife@gmail.com", city: "Laval" },
  { email: "eustachengoundjo@gmail.com", city: "Québec" },
  { email: "kpadenougide@gmail.com", city: "Longueuil" },
  { email: "calvindeutoukadji@gmail.com", city: "Québec" },
  { email: "t.bearr@hotmail.com", city: "Montréal" },
  { email: "sierratango727@gmail.com", city: "Montréal" },
  { email: "lyfa0091@gmail.com", city: "Québec" },
  { email: "samueldesgagne@gmail.com", city: "Lac-Saint-Jean" },
  { email: "foftm8@icloud.com", city: "Montréal" },
  { email: "cmohamedlamine517@gmail.com", city: "Gatineau" },
  { email: "oceanelgendron@gmail.com", city: "Ste Agathe-des-Monts" },
  { email: "mbambafaustin@yahoo.ca", city: "" }, // Pas de ville
  { email: "bonixnoubissi@gmail.com", city: "Rive-Sud" },
  { email: "dhawa268@gmail.com", city: "Saint-Basile-le-Grand" },
  { email: "babacarmar1998@gmail.com", city: "" }, // Pas de ville
  { email: "djamelluz@gmail.com", city: "Montréal" },
  { email: "konagboumemy9@gmail.com", city: "" }, // Pas de ville
  { email: "touclanidjetoh@gmail.com", city: "Val-d'or" },
  { email: "maximeruelcharbonneau@gmail.com", city: "" }, // Pas de ville
  { email: "abdramaneniambele29@gmail.com", city: "" }, // Pas de ville
  { email: "augusyvan3@gmail.com", city: "Sherbrook" },
  { email: "aurielatouou2018@gmail.com", city: "Québec" },
  { email: "pierrepaulatemfack@gmail.com", city: "Trois-Rivières" },
  { email: "davidgasleycius@gmail.com", city: "Québec" },
  { email: "usow94@gmail.com", city: "Montréal" },
  { email: "kinzaidir06@gmail.com", city: "Montréal" },
  { email: "kouameadelaide225@gmail.com", city: "" }, // Pas de ville
  { email: "frandysaintjeanmadara@gmail.com", city: "Montréal" },
  { email: "juniaducarly01@gmail.com", city: "Montréal" },
  { email: "jeanpierreraymond13@gmail.com", city: "Montréal" },
  { email: "hounnoukpelennox@gmail.com", city: "Montréal" },
  { email: "midlherj@gmail.com", city: "Montréal" },
  { email: "mamadoudianbarry441thiedeee@gmail.com", city: "" }, // Pas de ville
  { email: "alineflore1979@yahoo.com", city: "" }, // Pas de ville
  { email: "harislakhani99@hotmail.com", city: "" }, // Pas de ville
  { email: "jeanguylauture@gmail.com", city: "Montréal" },
  { email: "frismanmartinez34@gmail.com", city: "" }, // Pas de ville
  { email: "ezeddinebouaziz@gmail.com", city: "Montréal" },
  { email: "moreltchameni@gmail.com", city: "Québec" },
  { email: "alexandre.tallec01@gmail.com", city: "Québec" },
  { email: "chamberlindjedje@gmail.com", city: "Montréal" },
];

async function updateCities() {
  try {
    console.log('🔄 Mise à jour des villes depuis les données textuelles...\n');

    let updatedCount = 0;
    let notFoundCount = 0;
    let skippedCount = 0;

    for (const data of candidatesData) {
      try {
        // Skip if no city
        if (!data.city || data.city.trim() === '') {
          skippedCount++;
          continue;
        }

        const candidate = await prisma.candidate.findFirst({
          where: {
            email: {
              equals: data.email,
              mode: 'insensitive'
            }
          }
        });

        if (candidate) {
          await prisma.candidate.update({
            where: { id: candidate.id },
            data: { city: data.city }
          });
          console.log(`✅ ${data.email} -> ${data.city}`);
          updatedCount++;
        } else {
          console.log(`⚠️  Non trouvé: ${data.email}`);
          notFoundCount++;
        }
      } catch (error) {
        console.error(`❌ Erreur pour ${data.email}:`, error);
      }
    }

    console.log(`\n✅ Mise à jour terminée!`);
    console.log(`   - ${updatedCount} candidats mis à jour`);
    console.log(`   - ${notFoundCount} candidats non trouvés`);
    console.log(`   - ${skippedCount} candidats ignorés (pas de ville)`);

  } catch (error) {
    console.error('❌ Erreur:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updateCities();
