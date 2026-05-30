import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXCEL_FILE_PATH = 'C:\\Recrutement\\Grille d\'entretiens xguard.security (1).xlsx';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse un onglet candidat et retourne l'objet JSON structuré
function parseCandidateSheet(sheetData: any[][]): any {
  const details: any = {
    general: {},
    availability: {},
    experience: {},
    situationTests: [],
    psychoTech: {},
    evaluation: {},
    observation: {}
  };

  // Helper pour extraire la valeur de la colonne 1
  const getValue = (row: any[]) => row[1] ? String(row[1]).trim() : '';

  // Parcourir les lignes et extraire les informations
  for (let i = 0; i < sheetData.length; i++) {
    const row = sheetData[i];
    if (!row || row.length === 0) continue;

    const label = row[0] ? String(row[0]).trim() : '';
    const value = getValue(row);

    // Informations Générales
    if (label.includes('Date de l\'entretien')) {
      details.general.interviewDate = value;
    } else if (label.includes('Identité')) {
      details.general.identity = value;
    } else if (label.includes('Localisation')) {
      details.general.location = value;
    } else if (label.includes('Véhiculé')) {
      details.availability.hasVehicle = value;
    } else if (label.includes('Accès au site')) {
      details.availability.siteAccess = value;
    } else if (label.includes('Disponibilités : Jour/Soir/Nuit')) {
      details.availability.dayNightPreference = value;
    } else if (label.includes('Semaine/Fin de semaine')) {
      details.availability.weekWeekend = value;
    } else if (label.includes('Types de sites préférentiels')) {
      details.availability.preferredSites = value;
    } else if (label.includes('Que pensez-vous des quarts allant jusqu\'à 14 heures') && i < 20) {
      details.availability.longShifts = value;
    } else if (label.includes('Autorisation de travail')) {
      details.general.workAuthorization = value;
    } else if (label === 'Français') {
      details.general.frenchLevel = value;
    } else if (label === 'Anglais') {
      details.general.englishLevel = value;
    } else if (label.includes('Autres langues')) {
      details.general.otherLanguages = value;
    } else if (label === 'BSP') {
      details.general.bsp = value;
    }

    // Expériences
    else if (label.includes('Travails d\'avant')) {
      details.experience.previousWork = value;
    } else if (label.includes('Où ? quels postes')) {
      details.experience.positions = value;
    } else if (label === 'Agent de sécurité') {
      details.experience.securityGuard = value;
    } else if (label.includes('Où ? quel type de site')) {
      details.experience.siteTypes = value;
    }

    // Mise en situation
    else if (label === 'Feu') {
      details.situationTests.push({ question: 'Feu', answer: value });
    } else if (label === 'Inondation') {
      details.situationTests.push({ question: 'Inondation', answer: value });
    } else if (label === 'Personne en détresse') {
      details.situationTests.push({ question: 'Personne en détresse', answer: value });
    } else if (label === 'Personne violente') {
      details.situationTests.push({ question: 'Personne violente', answer: value });
    }

    // Psychotechnique
    else if (label.includes('Motivation par rapport au poste')) {
      details.psychoTech.motivation = value;
    } else if (label.includes('Qu\'est ce qu\'un bon agent')) {
      details.psychoTech.goodAgent = value;
    } else if (label.includes('mauvais agent')) {
      details.psychoTech.badAgent = value;
    } else if (label.includes('tâches principales')) {
      details.psychoTech.mainTasks = value;
    } else if (label.includes('Comment faites-vous pour rester éveillé')) {
      details.psychoTech.stayAwake = value;
    } else if (label.includes('Si un collègue dort')) {
      details.psychoTech.colleagueSleeping = value;
    }

    // Évaluation Générale
    else if (label === 'Attitude') {
      details.evaluation.attitude = value;
    } else if (label === 'Communication') {
      details.evaluation.communication = value;
    } else if (label.includes('Utilisation téchnologie')) {
      details.evaluation.technology = value;
    } else if (label.includes('Langue(s) utilisée(s)')) {
      details.evaluation.languagesUsed = value;
    } else if (label.includes('Niveau de professionnalisme')) {
      details.evaluation.professionalism = value;
    } else if (label.includes('Ponctualité / Présentation')) {
      details.evaluation.punctuality = value;
    }

    // Observation
    else if (label.includes('Avis RH')) {
      details.observation.hrOpinion = value;
    } else if (label === 'Note') {
      details.observation.rating = value;
    }
  }

  // Nettoyer les tests vides
  details.situationTests = details.situationTests.filter((t: any) => t.answer);

  return details;
}

async function importInterviewDetails() {
  console.log('='.repeat(80));
  console.log('📥 IMPORTATION DES DÉTAILS D\'ENTRETIEN');
  console.log('='.repeat(80));

  try {
    const workbook = XLSX.readFile(EXCEL_FILE_PATH);

    // Obtenir tous les candidats de la BD
    const candidates = await prisma.candidate.findMany({
      where: { isDeleted: false },
      select: { id: true, firstName: true, lastName: true }
    });

    console.log(`\n📊 Candidats en base: ${candidates.length}`);
    console.log(`📊 Onglets dans Excel: ${workbook.SheetNames.length}\n`);

    let imported = 0;
    let notFound = 0;

    for (const candidate of candidates) {
      const fullName = `${candidate.firstName} ${candidate.lastName}`;
      const normalizedName = normalize(fullName);

      // Chercher l'onglet correspondant au candidat
      let candidateSheet: any = null;
      let sheetName = '';

      for (const sName of workbook.SheetNames) {
        // Les onglets candidats ont le format "N.Nom Prenom" ou "Nom Prenom"
        const sheetNameNormalized = normalize(sName.replace(/^\d+\./, '').trim());

        if (sheetNameNormalized === normalizedName) {
          candidateSheet = workbook.Sheets[sName];
          sheetName = sName;
          break;
        }
      }

      if (!candidateSheet) {
        console.log(`⚠️  Onglet non trouvé pour: ${fullName}`);
        notFound++;
        continue;
      }

      // Parser l'onglet
      const rawData = XLSX.utils.sheet_to_json(candidateSheet, { header: 1 }) as any[][];
      const interviewDetails = parseCandidateSheet(rawData);

      // Mettre à jour le candidat
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { interviewDetails }
      });

      imported++;
      if (imported % 10 === 0) {
        console.log(`✅ ${imported} candidats traités...`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📈 RÉSUMÉ');
    console.log('='.repeat(80));
    console.log(`✅ Détails importés: ${imported}`);
    console.log(`⚠️  Onglets non trouvés: ${notFound}`);
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

importInterviewDetails();
