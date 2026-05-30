import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function testDocumentsAPI() {
  const apiKey = process.env.GOHIGHLEVEL_API_KEY;
  const locationId = process.env.GOHIGHLEVEL_LOCATION_ID;

  // Contact ID fourni par l'utilisateur
  const contactId = 'owiSyr6BQTJg2UuxNTwf';

  console.log(`🔍 Test de récupération des documents pour le contact: ${contactId}\n`);

  try {
    // Essayer l'endpoint documents
    console.log('📡 Tentative 1: GET /contacts/{contactId}/documents\n');

    const response = await axios.get(
      `https://services.leadconnectorhq.com/contacts/${contactId}/documents`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: '2021-07-28',
        },
      }
    );

    console.log('✅ Réponse reçue:');
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error: any) {
    if (error.response) {
      console.log(`❌ Erreur ${error.response.status}: ${error.response.statusText}`);
      console.log('Réponse:', JSON.stringify(error.response.data, null, 2));
    }

    // Essayer avec /locations/{locationId}/contacts/{contactId}
    console.log('\n📡 Tentative 2: GET contact details avec documents\n');

    try {
      const contactResponse = await axios.get(
        `https://services.leadconnectorhq.com/contacts/${contactId}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Version: '2021-07-28',
          },
        }
      );

      console.log('✅ Contact reçu. Cherchons les documents...\n');

      const contact = contactResponse.data.contact;

      // Afficher tous les champs du contact
      console.log('📋 Champs du contact:');
      console.log(JSON.stringify(contact, null, 2));

      // Chercher spécifiquement les documents
      if (contact.documents) {
        console.log('\n📎 Documents trouvés:', contact.documents);
      } else {
        console.log('\n⚠️ Pas de champ "documents" dans la réponse du contact');
      }

    } catch (error2: any) {
      console.log('\n❌ Erreur 2:', error2.response?.data || error2.message);
    }
  }
}

testDocumentsAPI();
