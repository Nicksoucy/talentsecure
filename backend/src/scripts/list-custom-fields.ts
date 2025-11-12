import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function listCustomFields() {
  const apiKey = process.env.GOHIGHLEVEL_API_KEY;
  const locationId = process.env.GOHIGHLEVEL_LOCATION_ID;

  console.log('📋 Récupération des custom fields disponibles...\n');

  try {
    const response = await axios.get(
      `https://services.leadconnectorhq.com/locations/${locationId}/customFields`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: '2021-07-28',
        },
      }
    );

    const customFields = response.data.customFields || [];

    console.log(`✅ ${customFields.length} custom fields trouvés:\n`);

    customFields.forEach((field: any) => {
      console.log(`📌 ${field.name}`);
      console.log(`   ID: ${field.id}`);
      console.log(`   Type: ${field.dataType}`);
      console.log(`   Field Key: ${field.fieldKey || 'N/A'}`);
      console.log('');
    });

    console.log('\n🔍 Cherche un champ qui contient "cv" ou "file" dans le nom...\n');

    const cvFields = customFields.filter((f: any) =>
      f.name?.toLowerCase().includes('cv') ||
      f.name?.toLowerCase().includes('file') ||
      f.dataType === 'FILE_UPLOAD'
    );

    if (cvFields.length > 0) {
      console.log('✅ Champs potentiels pour le CV:');
      cvFields.forEach((field: any) => {
        console.log(`   - ${field.name} (ID: ${field.id}, Type: ${field.dataType})`);
      });
    } else {
      console.log('⚠️ Aucun champ CV trouvé. Liste complète ci-dessus.');
    }

  } catch (error: any) {
    console.error('❌ Erreur:', error.response?.data || error.message);
  }
}

listCustomFields();
