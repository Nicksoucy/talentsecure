/**
 * Script to get Google Drive Refresh Token
 *
 * This script helps you obtain the refresh token needed to use Google Drive for video storage.
 *
 * Usage:
 *   1. Make sure you have GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in .env
 *   2. Run: npx ts-node scripts/get-google-drive-token.ts
 *   3. Follow the instructions
 */

import { generateAuthUrl, getTokensFromCode } from '../src/services/googleDrive.service';
import * as readline from 'readline';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function getToken() {
  console.log('\n' + '='.repeat(60));
  console.log('📁 CONFIGURATION GOOGLE DRIVE - Obtenir le Refresh Token');
  console.log('='.repeat(60) + '\n');

  // Check if credentials are configured
  if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_CLIENT_SECRET) {
    console.error('❌ Erreur: GOOGLE_DRIVE_CLIENT_ID et GOOGLE_DRIVE_CLIENT_SECRET doivent être définis dans .env\n');
    console.log('Suivez le guide GOOGLE_DRIVE_SETUP.md pour obtenir ces credentials.\n');
    process.exit(1);
  }

  try {
    // Generate authorization URL
    const authUrl = generateAuthUrl();

    console.log('Étapes à suivre:\n');
    console.log('1️⃣  Ouvrez cette URL dans votre navigateur:\n');
    console.log('   ' + authUrl + '\n');
    console.log('2️⃣  Connectez-vous avec le compte Google que vous voulez utiliser');
    console.log('   (Recommandé: academie@academiexguard.ca)\n');
    console.log('3️⃣  Autorisez l\'application TalentSecure\n');
    console.log('4️⃣  Vous serez redirigé vers une page avec un "code"');
    console.log('   L\'URL ressemblera à: http://localhost:5000/auth/google/drive/callback?code=XXXXX\n');
    console.log('5️⃣  Copiez le CODE complet et collez-le ci-dessous:\n');
    console.log('-'.repeat(60) + '\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('Entrez le code d\'autorisation: ', async (code) => {
      try {
        console.log('\n⏳ Obtention des tokens...\n');

        const tokens = await getTokensFromCode(code.trim());

        if (!tokens.refresh_token) {
          console.error('❌ Erreur: Aucun refresh token reçu.');
          console.log('Assurez-vous d\'utiliser le lien exact fourni ci-dessus.\n');
          rl.close();
          process.exit(1);
        }

        console.log('✅ Tokens obtenus avec succès!\n');
        console.log('='.repeat(60));
        console.log('AJOUTEZ CETTE LIGNE À VOTRE FICHIER .env:');
        console.log('='.repeat(60) + '\n');
        console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
        console.log('='.repeat(60));
        console.log('ET ACTIVEZ GOOGLE DRIVE:');
        console.log('='.repeat(60) + '\n');
        console.log('USE_GOOGLE_DRIVE=true\n');
        console.log('='.repeat(60) + '\n');

        console.log('📝 Prochaines étapes:\n');
        console.log('1. Copiez le GOOGLE_DRIVE_REFRESH_TOKEN ci-dessus');
        console.log('2. Ajoutez-le dans votre fichier .env');
        console.log('3. Changez USE_GOOGLE_DRIVE=true dans .env');
        console.log('4. Redémarrez votre serveur backend');
        console.log('5. Uploadez une vidéo test pour vérifier\n');

        console.log('✨ Vous êtes prêt à utiliser Google Drive!\n');

        rl.close();
      } catch (error: any) {
        console.error('\n❌ Erreur lors de l\'obtention des tokens:', error.message);
        console.log('\nVérifiez que:');
        console.log('- Le code est correct et complet');
        console.log('- GOOGLE_DRIVE_CLIENT_ID est correct dans .env');
        console.log('- GOOGLE_DRIVE_CLIENT_SECRET est correct dans .env');
        console.log('- L\'API Google Drive est activée dans Google Cloud Console\n');
        rl.close();
        process.exit(1);
      }
    });
  } catch (error: any) {
    console.error('\n❌ Erreur:', error.message);
    console.log('\nAssurez-vous que:');
    console.log('- GOOGLE_DRIVE_CLIENT_ID est défini dans .env');
    console.log('- GOOGLE_DRIVE_CLIENT_SECRET est défini dans .env');
    console.log('- L\'API Google Drive est activée\n');
    process.exit(1);
  }
}

// Run the script
getToken();
