# ✅ Cloudflare R2 - Configuration Complète

## 🎉 Ce qui a été fait

### 1. **Installation des dépendances**
✅ Installé `@aws-sdk/client-s3` et `@aws-sdk/s3-request-presigner`

### 2. **Nouveau service R2**
✅ Créé `backend/src/services/r2.service.ts` avec:
- Upload de vidéos vers R2
- Suppression de vidéos
- Génération de signed URLs (URLs temporaires sécurisées)
- Support pour domaines custom (optionnel)

### 3. **Mise à jour du service vidéo**
✅ Modifié `backend/src/services/video.service.ts` pour:
- **Nouvelle priorité**: R2 > Google Drive > GCS > Local
- Support complet de R2 dans processVideoUpload, deleteVideo, getVideoUrl

### 4. **Mise à jour du contrôleur**
✅ Modifié `backend/src/controllers/candidate.controller.ts` pour:
- Générer des signed URLs R2 quand pas de domaine custom
- Support transparent de R2 dans getCandidateVideoUrl

### 5. **Configuration .env**
✅ Ajouté les variables R2 dans `.env` (désactivées par défaut)

### 6. **Documentation complète**
✅ Créé `CLOUDFLARE_R2_SETUP.md` avec guide étape par étape

---

## 📝 Prochaines étapes pour TOI

### Étape 1: Créer un compte Cloudflare R2

1. Va sur https://dash.cloudflare.com/sign-up
2. Crée un compte gratuit
3. Vérifie ton email

### Étape 2: Créer un bucket R2

1. Dans le dashboard Cloudflare, clique sur **R2**
2. Clique sur **Purchase R2 Plan** > **Free Plan**
3. Clique sur **Create bucket**
4. Nom: `talentsecure-videos`
5. Location: **Automatic**
6. Crée le bucket

### Étape 3: Créer un API Token

1. Dans **R2** > **Overview**
2. Clique sur **Manage R2 API Tokens**
3. Clique sur **Create API Token**
4. Configuration:
   - Token name: `TalentSecure Backend`
   - Permissions: **Object Read & Write**
   - Bucket: `talentsecure-videos`
5. **COPIE ET GARDE CES VALEURS** (tu ne les reverras plus!):
   ```
   Access Key ID: xxxxxxxxxxxx
   Secret Access Key: yyyyyyyyyyyy
   ```

### Étape 4: Obtenir l'Account ID

1. Dans **R2** > **Overview**
2. Tu verras ton **Account ID** (ex: `abc123def456`)
3. L'endpoint sera: `https://abc123def456.r2.cloudflarestorage.com`

### Étape 5: Configurer le .env

Modifie `backend/.env` et remplis ces valeurs:

```env
# ACTIVE R2
USE_R2=true

# Remplis ces valeurs avec ce que tu as copié
R2_ACCOUNT_ID=ton_account_id_ici
R2_ACCESS_KEY_ID=ton_access_key_id_ici
R2_SECRET_ACCESS_KEY=ton_secret_access_key_ici
R2_BUCKET_NAME=talentsecure-videos
R2_ENDPOINT=https://ton_account_id.r2.cloudflarestorage.com

# Laisse vide si tu n'as pas de domaine custom
R2_PUBLIC_URL=

# DÉSACTIVE Google Drive
USE_GOOGLE_DRIVE=false
```

### Étape 6: Redémarrer le serveur

```bash
cd backend
npm run dev
```

### Étape 7: Tester l'upload

1. Va sur l'application: http://localhost:5173
2. Connecte-toi
3. Va sur un candidat
4. Upload une vidéo test
5. Vérifie dans les logs du serveur:
   ```
   ✅ Uploading video to Cloudflare R2...
   ✅ Video uploaded to R2. Key: videos/candidates/...
   ```
6. Vérifie dans le dashboard R2 que la vidéo apparaît
7. Essaie de lire la vidéo dans l'app!

---

## 🎯 Comment ça marche

### Sans domaine custom (défaut):
- Les vidéos sont uploadées vers R2
- Quand tu charges une vidéo, le backend génère une **signed URL** (valide 1 heure)
- La vidéo se charge directement depuis R2
- Parfait pour le streaming! ✅

### Avec domaine custom (optionnel):
- Configure `videos.ton-domaine.com` dans Cloudflare
- Les vidéos sont accessibles via `https://videos.ton-domaine.com/videos/...`
- Pas besoin de signed URLs
- URLs permanentes

---

## 💰 Coûts

### FREE TIER (ce que tu utilises):
- **10 GB de stockage**: Gratuit
- **Bande passante**: **TOTALEMENT GRATUITE** (pas de limite!)
- **Opérations**: 1M writes + 10M reads gratuits/mois

### Après le free tier:
- **Stockage**: $0.015/GB/mois (~$0.15 pour 10 vidéos supplémentaires)
- **Bande passante**: **TOUJOURS GRATUITE** 🎉
- **Opérations**: Largement suffisant pour TalentSecure

**Exemple**: 50 vidéos de 100 MB = 5 GB = **$0.00/mois**
Si 1000 personnes regardent ces vidéos = **$0.00/mois** (bande passante gratuite!)

---

## 🔄 Migration depuis Google Drive

Si tu as déjà des vidéos sur Google Drive, tu peux les migrer manuellement:

1. Télécharge les vidéos depuis Google Drive
2. Re-upload-les via l'interface TalentSecure
3. Elles seront automatiquement envoyées vers R2!

Ou je peux créer un script de migration automatique si tu veux.

---

## 🆘 Besoin d'aide?

### Vérifier les logs
Si l'upload ne fonctionne pas, check les logs du serveur backend:
```bash
cd backend
npm run dev
# Upload une vidéo et regarde les logs
```

### Erreurs communes

**"R2 credentials not configured"**
→ Vérifie que USE_R2=true et que les credentials sont remplis dans .env

**"Access Denied"**
→ Vérifie que l'API token a les permissions **Object Read & Write**

**"Invalid endpoint"**
→ Vérifie le format: `https://<account-id>.r2.cloudflarestorage.com` (pas de slash à la fin!)

---

## 📚 Documentation

- Guide complet: `CLOUDFLARE_R2_SETUP.md`
- Doc officielle: https://developers.cloudflare.com/r2/

---

**Prêt?** Suis les étapes ci-dessus et fais-moi signe quand tu as configuré R2! 🚀
