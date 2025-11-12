import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const streamPipeline = promisify(pipeline);

// Mapping des noms de villes pour normalisation
const CITY_MAPPINGS: Record<string, string> = {
  'montreal': 'Montréal',
  'montréal': 'Montréal',
  'mtl': 'Montréal',
  'quebec': 'Québec',
  'québec': 'Québec',
  'qc': 'Québec',
  'laval': 'Laval',
  'gatineau': 'Gatineau',
  'longueuil': 'Longueuil',
  'sherbrooke': 'Sherbrooke',
  'trois-rivieres': 'Trois-Rivières',
  'trois-rivières': 'Trois-Rivières',
  'saguenay': 'Saguenay',
  'levis': 'Lévis',
  'lévis': 'Lévis',
  'terrebonne': 'Terrebonne',
  'saint-jerome': 'Saint-Jérôme',
  'saint-jérôme': 'Saint-Jérôme',
  'st-jerome': 'Saint-Jérôme',
  'st-jérôme': 'Saint-Jérôme',
  'repentigny': 'Repentigny',
  'brossard': 'Brossard',
  'drummondville': 'Drummondville',
  'saint-jean-sur-richelieu': 'Saint-Jean-sur-Richelieu',
  'st-jean-sur-richelieu': 'Saint-Jean-sur-Richelieu',
  'granby': 'Granby',
  'blainville': 'Blainville',
  'shawinigan': 'Shawinigan',
  'dollard-des-ormeaux': 'Dollard-des-Ormeaux',
  'saint-hyacinthe': 'Saint-Hyacinthe',
  'st-hyacinthe': 'Saint-Hyacinthe',
};

function normalizeCity(city: string | null | undefined): string | null {
  if (!city) return null;

  const normalized = city
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return CITY_MAPPINGS[normalized] || city.trim();
}

interface GoHighLevelContact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  customFields?: Record<string, any>;
  dateAdded?: string;
}

async function downloadCV(cvUrl: string, prospectId: string): Promise<string | null> {
  try {
    // Créer le dossier de destination si nécessaire
    const uploadsDir = path.join(__dirname, '../../uploads/cvs/prospects');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Extraire l'extension du fichier depuis l'URL
    const urlPath = new URL(cvUrl).pathname;
    const extension = path.extname(urlPath) || '.pdf';
    const filename = `${prospectId}${extension}`;
    const filepath = path.join(uploadsDir, filename);

    // Télécharger le fichier
    const response = await axios({
      method: 'GET',
      url: cvUrl,
      responseType: 'stream',
      timeout: 30000,
    });

    await streamPipeline(response.data, fs.createWriteStream(filepath));

    console.log(`  ✅ CV téléchargé: ${filename}`);
    return `/uploads/cvs/prospects/${filename}`;
  } catch (error) {
    console.error(`  ❌ Erreur téléchargement CV:`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function fetchGoHighLevelContacts(): Promise<GoHighLevelContact[]> {
  const apiKey = process.env.GOHIGHLEVEL_API_KEY;
  const locationId = process.env.GOHIGHLEVEL_LOCATION_ID;

  if (!apiKey) {
    throw new Error('GOHIGHLEVEL_API_KEY non définie dans .env');
  }

  if (!locationId) {
    throw new Error('GOHIGHLEVEL_LOCATION_ID non définie dans .env');
  }

  console.log('📡 Récupération des contacts depuis GoHighLevel...');

  try {
    const contacts: GoHighLevelContact[] = [];
    let nextCursor: string | undefined = undefined;
    const limit = 100;
    let pageCount = 0;

    // API v2.0 utilise la pagination par cursor
    do {
      pageCount++;
      const params: any = {
        locationId,
        limit,
      };

      if (nextCursor) {
        params.startAfterId = nextCursor;
      }

      console.log(`  📄 Page ${pageCount}: Récupération...`);

      const response = await axios.get(
        `https://services.leadconnectorhq.com/contacts/`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Version: '2021-07-28',
          },
          params,
        }
      );

      const batch = response.data.contacts || [];
      contacts.push(...batch);

      console.log(`     ✓ ${batch.length} contacts sur cette page. Total: ${contacts.length}`);

      // API v2.0 utilise meta.nextStartAfterId pour la pagination
      const previousCursor = nextCursor;
      nextCursor = response.data.meta?.nextStartAfterId;

      // Debug: afficher si on a un nextCursor
      if (nextCursor) {
        console.log(`     → Cursor suivant: ${nextCursor.substring(0, 20)}...`);
      } else {
        console.log(`     → Fin de la pagination (pas de nextCursor)`);
      }

      // Sécurité: éviter boucle infinie
      if (nextCursor === previousCursor) {
        console.log(`     ⚠️ Cursor identique détecté, arrêt pour éviter boucle infinie`);
        break;
      }

      // Limite de sécurité: max 20 pages (2000 contacts)
      if (pageCount >= 20) {
        console.log(`     ⚠️ Limite de 20 pages atteinte, arrêt de sécurité`);
        break;
      }
    } while (nextCursor);

    console.log(`✅ Total: ${contacts.length} contacts récupérés en ${pageCount} pages`);
    return contacts;
  } catch (error: any) {
    console.error('❌ Erreur lors de la récupération des contacts:', error.response?.data || error.message);
    throw error;
  }
}

async function importContact(contact: GoHighLevelContact): Promise<'created' | 'duplicate' | 'skipped'> {
  try {
    const firstName = contact.firstName || '';
    const lastName = contact.lastName || '';
    const email = contact.email || null;
    const phone = contact.phone || '';
    const city = normalizeCity(contact.city);
    const streetAddress = contact.address1 || null;
    const province = contact.state || 'QC';
    const postalCode = contact.postalCode || null;
    const country = contact.country || 'CA';

    // Récupérer l'URL du CV depuis les custom fields
    // Le CV est dans le custom field avec ID: cm3tVwxgP152THc1PMZy
    let cvUrl: string | null = null;

    if (contact.customFields && Array.isArray(contact.customFields)) {
      const cvField = contact.customFields.find((f: any) => f.id === 'cm3tVwxgP152THc1PMZy');

      if (cvField && cvField.value && typeof cvField.value === 'object') {
        // La valeur est un objet avec des UUIDs comme clés
        // Extraire le premier document trouvé
        const documents = Object.values(cvField.value);
        if (documents.length > 0) {
          const firstDoc: any = documents[0];
          cvUrl = firstDoc.url || null;
        }
      }
    }

    // Validation: on a besoin au minimum d'un prénom et d'un téléphone
    if (!firstName || !phone) {
      console.log(`  ⚠️ Contact ignoré (données manquantes): ${firstName} ${lastName} - ${phone}`);
      return 'skipped';
    }

    // Vérifier si le contact existe déjà
    const existing = await prisma.prospectCandidate.findFirst({
      where: {
        OR: [
          email ? { email } : {},
          { phone }
        ],
        isDeleted: false,
      }
    });

    if (existing) {
      console.log(`  ⚠️ Doublon détecté: ${firstName} ${lastName} (${email || phone})`);
      return 'duplicate';
    }

    // Créer le prospect
    const prospect = await prisma.prospectCandidate.create({
      data: {
        firstName,
        lastName: lastName || '',
        email,
        phone,
        city,
        streetAddress,
        province,
        postalCode,
        country,
        fullAddress: streetAddress ? `${streetAddress}, ${city || ''}, ${province}, ${country}` : null,
        cvUrl,
        submissionDate: contact.dateAdded ? new Date(contact.dateAdded) : new Date(),
        isContacted: false,
        isConverted: false,
        notes: cvUrl
          ? 'Importé depuis GoHighLevel avec CV'
          : 'Importé depuis GoHighLevel',
      },
    });

    console.log(`  ✅ Importé: ${firstName} ${lastName} ${cvUrl ? '(avec CV)' : ''}`);
    return 'created';
  } catch (error) {
    console.error(`  ❌ Erreur lors de l'import:`, error);
    return 'skipped';
  }
}

async function cleanTestProspects(): Promise<number> {
  console.log('\n🧹 Nettoyage des prospects de test...');

  const testProspects = await prisma.prospectCandidate.findMany({
    where: {
      OR: [
        { firstName: { contains: 'test', mode: 'insensitive' } },
        { email: { contains: 'test', mode: 'insensitive' } },
        { notes: { contains: 'Test', mode: 'insensitive' } },
      ],
      isDeleted: false,
    },
  });

  console.log(`  Trouvé ${testProspects.length} prospects de test`);

  if (testProspects.length > 0) {
    // Soft delete
    await prisma.prospectCandidate.updateMany({
      where: {
        id: { in: testProspects.map(p => p.id) },
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    console.log(`  ✅ ${testProspects.length} prospects de test supprimés`);
  }

  return testProspects.length;
}

async function main() {
  console.log('🚀 Import des contacts GoHighLevel\n');
  console.log('════════════════════════════════════════\n');

  try {
    // Étape 1: Nettoyer les prospects de test (optionnel)
    const cleanupArg = process.argv.includes('--clean');
    let cleaned = 0;
    if (cleanupArg) {
      cleaned = await cleanTestProspects();
    }

    // Étape 2: Récupérer les contacts depuis GoHighLevel
    const contacts = await fetchGoHighLevelContacts();

    // Étape 3: Importer les contacts
    console.log('\n📥 Import des contacts dans TalentSecure...\n');

    let created = 0;
    let duplicates = 0;
    let skipped = 0;

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      console.log(`[${i + 1}/${contacts.length}] ${contact.firstName} ${contact.lastName}`);

      const result = await importContact(contact);

      if (result === 'created') created++;
      else if (result === 'duplicate') duplicates++;
      else skipped++;
    }

    // Résumé
    console.log('\n════════════════════════════════════════');
    console.log('📊 RÉSUMÉ DE L\'IMPORT\n');
    if (cleaned > 0) {
      console.log(`🧹 Prospects de test supprimés: ${cleaned}`);
    }
    console.log(`✅ Nouveaux prospects créés: ${created}`);
    console.log(`⚠️  Doublons ignorés: ${duplicates}`);
    console.log(`❌ Contacts ignorés: ${skipped}`);
    console.log(`📊 Total traité: ${contacts.length}`);
    console.log('════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
