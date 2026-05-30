import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function findCVField() {
  const apiKey = process.env.GOHIGHLEVEL_API_KEY;
  const locationId = process.env.GOHIGHLEVEL_LOCATION_ID;

  console.log('🔍 Recherche du custom field CV dans les contacts...\n');

  try {
    // Récupérer plusieurs contacts pour trouver celui avec un CV
    const response = await axios.get(
      `https://services.leadconnectorhq.com/contacts/`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: '2021-07-28',
        },
        params: {
          locationId,
          limit: 50, // Récupérer 50 contacts pour avoir plus de chances
        },
      }
    );

    const contacts = response.data.contacts || [];
    console.log(`📊 ${contacts.length} contacts récupérés\n`);

    // Chercher des contacts qui ont des custom fields avec des URLs
    let cvFieldFound = false;

    for (const contact of contacts) {
      const customFields = contact.customFields || [];

      if (customFields.length === 0) continue;

      // Chercher un custom field qui contient une URL (probablement le CV)
      for (const field of customFields) {
        const value = Array.isArray(field.value) ? field.value[0] : field.value;

        // Vérifier si la valeur ressemble à un CV (PDF, DOC, fichier uploadé)
        if (typeof value === 'string' && value.includes('http') &&
            (value.includes('.pdf') || value.includes('.doc') || value.includes('/files/') || value.includes('storage') || value.includes('upload'))) {
          console.log(`\n🎯 CV TROUVÉ! Contact: ${contact.firstName} ${contact.lastName}`);
          console.log(`   Email: ${contact.email}`);
          console.log(`   \n   📎 Custom Field ID: ${field.id}`);
          console.log(`   📄 CV URL: ${value}`);
          console.log(`\n   ✅ Utilise cet ID dans le script d'import!`);
          cvFieldFound = true;
          break;
        }

        // Afficher toutes les URLs trouvées pour debug
        if (typeof value === 'string' && value.includes('http')) {
          console.log(`\n🔗 URL trouvée (${contact.firstName} ${contact.lastName}):`);
          console.log(`   Field ID: ${field.id}`);
          console.log(`   URL: ${value}`);
        }
      }

      if (cvFieldFound) break;
    }

    if (!cvFieldFound) {
      console.log('\n⚠️ Aucun custom field avec URL trouvé dans les 50 premiers contacts.');
      console.log('\nAffichage de tous les custom fields des premiers contacts:\n');

      // Afficher les custom fields des 3 premiers contacts pour debug
      for (let i = 0; i < Math.min(3, contacts.length); i++) {
        const contact = contacts[i];
        console.log(`\n📋 Contact ${i + 1}: ${contact.firstName} ${contact.lastName}`);
        console.log(`   Custom Fields:`);

        const customFields = contact.customFields || [];
        if (customFields.length === 0) {
          console.log('   (aucun custom field)');
        } else {
          customFields.forEach((field: any) => {
            const value = Array.isArray(field.value) ? field.value : [field.value];
            console.log(`   - ID: ${field.id}`);
            console.log(`     Valeur: ${JSON.stringify(value)}`);
          });
        }
      }
    }

  } catch (error: any) {
    console.error('❌ Erreur:', error.response?.data || error.message);
  }
}

findCVField();
