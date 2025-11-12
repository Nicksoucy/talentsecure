import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function debugContact() {
  const apiKey = process.env.GOHIGHLEVEL_API_KEY;
  const locationId = process.env.GOHIGHLEVEL_LOCATION_ID;

  console.log('🔍 Récupération d\'un contact de test pour inspection...\n');

  try {
    const response = await axios.get(
      `https://services.leadconnectorhq.com/contacts/`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: '2021-07-28',
        },
        params: {
          locationId,
          limit: 1,
        },
      }
    );

    const contact = response.data.contacts?.[0];

    if (contact) {
      console.log('📄 STRUCTURE COMPLÈTE DU CONTACT:\n');
      console.log(JSON.stringify(contact, null, 2));

      console.log('\n\n📌 CUSTOM FIELDS:\n');
      console.log(JSON.stringify(contact.customFields || contact.customField || 'Aucun', null, 2));
    } else {
      console.log('❌ Aucun contact trouvé');
    }
  } catch (error: any) {
    console.error('❌ Erreur:', error.response?.data || error.message);
  }
}

debugContact();
