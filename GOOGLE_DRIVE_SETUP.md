# 📁 Configuration Google Drive pour Stockage Vidéos

## 🎯 Pourquoi Google Drive?

✅ **15 GB gratuits** (vs 5 GB pour GCS/S3)
✅ **Totalement gratuit** à vie
✅ **Pas de coûts cachés**
✅ **Facile à gérer** via interface Google Drive
⚠️ **IMPORTANT**: Sur Cloud Run, les fichiers locaux sont EFFACÉS à chaque déploiement!

---

## 📋 Étape 1: Créer un Projet Google Cloud

1. Allez sur [Google Cloud Console](https://console.cloud.google.com/)
2. Créez un nouveau projet (ou utilisez le projet existant `talentsecure`)
3. Notez le **Project ID**

---

## 🔑 Étape 2: Activer l'API Google Drive

1. Dans votre projet Google Cloud, allez dans **APIs & Services** > **Library**
2. Recherchez "**Google Drive API**"
3. Cliquez sur **Enable** (Activer)

---

## 🎫 Étape 3: Créer les Credentials OAuth 2.0

### A. Configurer l'écran de consentement OAuth

1. Allez dans **APIs & Services** > **OAuth consent screen**
2. Sélectionnez **External** (sauf si vous avez Google Workspace)
3. Remplissez:
   - **App name**: TalentSecure
   - **User support email**: votre email
   - **Developer contact**: votre email
4. Cliquez sur **Save and Continue**
5. Dans **Scopes**, cliquez sur **Add or Remove Scopes**
6. Recherchez et ajoutez: `https://www.googleapis.com/auth/drive.file`
7. Cliquez sur **Save and Continue**
8. Ajoutez votre email comme **Test user** (pour le développement)
9. Cliquez sur **Save and Continue**

### B. Créer les credentials OAuth 2.0

1. Allez dans **APIs & Services** > **Credentials**
2. Cliquez sur **Create Credentials** > **OAuth client ID**
3. Sélectionnez **Web application**
4. Remplissez:
   - **Name**: TalentSecure Backend
   - **Authorized redirect URIs**:
     - Pour développement: `http://localhost:5000/auth/google/drive/callback`
     - Pour production: `https://votre-domaine.com/auth/google/drive/callback`
5. Cliquez sur **Create**
6. **Copiez** le `Client ID` et `Client Secret`

---

## 🔐 Étape 4: Obtenir le Refresh Token

### Option A: Utiliser le script fourni (recommandé)

1. Ouvrez votre terminal dans le dossier backend:
   ```bash
   cd backend
   ```

2. Ajoutez vos credentials dans `.env`:
   ```env
   GOOGLE_DRIVE_CLIENT_ID=votre_client_id_ici
   GOOGLE_DRIVE_CLIENT_SECRET=votre_client_secret_ici
   ```

3. Créez un fichier `scripts/get-google-drive-token.ts`:
   ```typescript
   import { generateAuthUrl, getTokensFromCode } from '../src/services/googleDrive.service';
   import * as readline from 'readline';

   async function getToken() {
     // Generate auth URL
     const authUrl = generateAuthUrl();

     console.log('\n📁 Configuration Google Drive - Obtenir le Refresh Token\n');
     console.log('1. Ouvrez cette URL dans votre navigateur:');
     console.log('\n' + authUrl + '\n');
     console.log('2. Autorisez l\'application');
     console.log('3. Vous serez redirigé vers une page avec un code');
     console.log('4. Copiez le code et collez-le ci-dessous:\n');

     const rl = readline.createInterface({
       input: process.stdin,
       output: process.stdout,
     });

     rl.question('Code: ', async (code) => {
       try {
         const tokens = await getTokensFromCode(code);

         console.log('\n✅ Tokens obtenus avec succès!\n');
         console.log('Ajoutez cette ligne à votre fichier .env:\n');
         console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
         console.log('Et activez Google Drive:\n');
         console.log('USE_GOOGLE_DRIVE=true\n');

         rl.close();
       } catch (error) {
         console.error('❌ Erreur:', error);
         rl.close();
       }
     });
   }

   getToken();
   ```

4. Exécutez le script:
   ```bash
   npx ts-node scripts/get-google-drive-token.ts
   ```

5. Suivez les instructions affichées

### Option B: Manuellement via Postman/cURL

1. Ouvrez cette URL dans votre navigateur (remplacez les valeurs):
   ```
   https://accounts.google.com/o/oauth2/v2/auth?
   client_id=VOTRE_CLIENT_ID&
   redirect_uri=http://localhost:5000/auth/google/drive/callback&
   response_type=code&
   scope=https://www.googleapis.com/auth/drive.file&
   access_type=offline&
   prompt=consent
   ```

2. Autorisez l'application
3. Vous serez redirigé vers une URL comme: `http://localhost:5000/auth/google/drive/callback?code=XXXXX`
4. Copiez le `code` de l'URL
5. Utilisez ce code pour obtenir le refresh token via cURL:
   ```bash
   curl -X POST https://oauth2.googleapis.com/token \
     -d "code=VOTRE_CODE" \
     -d "client_id=VOTRE_CLIENT_ID" \
     -d "client_secret=VOTRE_CLIENT_SECRET" \
     -d "redirect_uri=http://localhost:5000/auth/google/drive/callback" \
     -d "grant_type=authorization_code"
   ```

6. La réponse contiendra le `refresh_token`

---

## ⚙️ Étape 5: Configuration du .env

Mettez à jour votre fichier `.env`:

```env
# Google Drive Storage - GRATUIT 15 GB!
USE_GOOGLE_DRIVE=true
GOOGLE_DRIVE_CLIENT_ID=votre_client_id_ici
GOOGLE_DRIVE_CLIENT_SECRET=votre_client_secret_ici
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:5000/auth/google/drive/callback
GOOGLE_DRIVE_REFRESH_TOKEN=votre_refresh_token_ici
GOOGLE_DRIVE_FOLDER_ID=  # Optionnel: ID du dossier pour organiser les vidéos
```

---

## 📂 Étape 6: Créer un Dossier Dédié (Optionnel)

1. Allez sur [Google Drive](https://drive.google.com)
2. Créez un nouveau dossier: "TalentSecure Videos"
3. Ouvrez le dossier
4. L'ID du dossier est dans l'URL: `https://drive.google.com/drive/folders/FOLDER_ID_ICI`
5. Copiez le `FOLDER_ID` et ajoutez-le dans `.env`:
   ```env
   GOOGLE_DRIVE_FOLDER_ID=votre_folder_id_ici
   ```

---

## 🧪 Étape 7: Tester la Configuration

1. Redémarrez votre serveur backend:
   ```bash
   npm run dev
   ```

2. Uploadez une vidéo test via l'interface TalentSecure

3. Vérifiez les logs du serveur:
   ```
   ✅ Uploading video to Google Drive...
   ✅ Video uploaded to Google Drive. File ID: XXXXX
   ```

4. Allez sur Google Drive et vérifiez que la vidéo apparaît

5. Testez la lecture de la vidéo dans l'application

---

## 🔒 Sécurité en Production

Pour la production (Cloud Run), **ajoutez les variables d'environnement** via la console Google Cloud:

1. Allez dans **Cloud Run** > Votre service
2. Cliquez sur **Edit & Deploy New Revision**
3. Dans **Variables & Secrets** > **Variables**, ajoutez:
   ```
   USE_GOOGLE_DRIVE=true
   GOOGLE_DRIVE_CLIENT_ID=...
   GOOGLE_DRIVE_CLIENT_SECRET=...
   GOOGLE_DRIVE_REFRESH_TOKEN=...
   GOOGLE_DRIVE_FOLDER_ID=...
   ```
4. Cliquez sur **Deploy**

---

## 📊 Limites et Quotas

Google Drive gratuit a les limites suivantes:

| Ressource | Limite | Impact TalentSecure |
|-----------|--------|---------------------|
| Stockage | 15 GB | ✅ ~300 vidéos de 50 MB |
| Téléchargements/jour | ~750 GB | ✅ Largement suffisant |
| Requêtes API/jour | 20,000 | ✅ Plus qu'assez |
| Requêtes API/100s | 1,000 | ✅ Pas de souci |

---

## 🆘 Dépannage

### Erreur: "Invalid credentials"
- Vérifiez que `CLIENT_ID` et `CLIENT_SECRET` sont corrects
- Vérifiez que l'API Google Drive est activée

### Erreur: "Invalid refresh token"
- Le refresh token doit être obtenu avec `access_type=offline` et `prompt=consent`
- Régénérez un nouveau token en suivant l'étape 4

### Erreur: "Quota exceeded"
- Vous avez dépassé les limites Google Drive
- Attendez 24h ou passez à Google Cloud Storage

### Les vidéos ne s'affichent pas
- Vérifiez que les permissions sont bien `type: 'anyone', role: 'reader'`
- Vérifiez l'URL générée: elle doit commencer par `https://drive.google.com/file/d/...`

---

## 🚀 Migration vers Google Cloud Storage (si nécessaire)

Si vous dépassez les 15 GB ou les limites de bande passante:

1. Désactivez Google Drive:
   ```env
   USE_GOOGLE_DRIVE=false
   USE_GCS=true
   ```

2. Suivez le guide [GOOGLE_CLOUD_STORAGE_SETUP.md](./GOOGLE_CLOUD_STORAGE_SETUP.md)

---

## 💡 Conseils

- **Organisez par dossiers**: Créez des dossiers par mois ou par catégorie
- **Nettoyez régulièrement**: Supprimez les vidéos des candidats archivés
- **Surveillez l'espace**: Activez les notifications Google Drive pour l'espace de stockage
- **Backup**: Les vidéos Google Drive ne sont pas supprimées lors des redéploiements!

---

## ✅ Checklist Finale

- [ ] API Google Drive activée
- [ ] OAuth consent screen configuré
- [ ] Client ID et Secret créés
- [ ] Refresh token obtenu
- [ ] Variables .env remplies
- [ ] Dossier Google Drive créé (optionnel)
- [ ] Test d'upload réussi
- [ ] Test de lecture réussi
- [ ] Variables production configurées (Cloud Run)

---

**Besoin d'aide?** Consultez la [documentation officielle Google Drive API](https://developers.google.com/drive/api/v3/about-sdk)
