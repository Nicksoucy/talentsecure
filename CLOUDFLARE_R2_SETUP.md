# 📦 Configuration Cloudflare R2 pour Stockage Vidéos

## 🎯 Pourquoi Cloudflare R2?

✅ **10 GB gratuits** (vs 5 GB pour GCS)
✅ **Bande passante GRATUITE** (GCS charge $0.12/GB!)
✅ **Parfait pour streaming vidéo**
✅ **Compatible S3 API** (facile à intégrer)
✅ **Pas de frais cachés**

---

## 📋 Étape 1: Créer un compte Cloudflare

1. Allez sur [Cloudflare Dashboard](https://dash.cloudflare.com/sign-up)
2. Créez un compte gratuit (email + mot de passe)
3. Vérifiez votre email

---

## 🪣 Étape 2: Créer un Bucket R2

1. Dans le dashboard Cloudflare, cliquez sur **R2** dans le menu de gauche
2. Si c'est votre première fois:
   - Cliquez sur **Purchase R2 Plan**
   - Sélectionnez le **Free Plan** (10 GB gratuits)
   - Confirmez
3. Cliquez sur **Create bucket**
4. Nom du bucket: `talentsecure-videos`
5. Location: **Automatic** (recommandé)
6. Cliquez sur **Create bucket**

---

## 🔑 Étape 3: Créer des API Tokens

1. Allez dans **R2** > **Overview**
2. Cliquez sur **Manage R2 API Tokens**
3. Cliquez sur **Create API Token**
4. Configuration:
   - **Token name**: `TalentSecure Backend`
   - **Permissions**:
     - ✅ Object Read & Write
   - **Specify bucket(s)**: Sélectionnez `talentsecure-videos`
   - **TTL**: Pas de limite (ou 1 an)
5. Cliquez sur **Create API Token**

6. **IMPORTANT**: Copiez ces 3 valeurs (vous ne les reverrez plus!):
   ```
   Access Key ID: xxxxxxxxxxxxxxxxxxxx
   Secret Access Key: yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
   ```

---

## 🌐 Étape 4: Obtenir l'endpoint URL

1. Retournez dans **R2** > **Overview**
2. Vous verrez votre **Account ID** (ex: `abc123def456`)
3. L'endpoint R2 est au format:
   ```
   https://<account-id>.r2.cloudflarestorage.com
   ```

   Par exemple: `https://abc123def456.r2.cloudflarestorage.com`

---

## ⚙️ Étape 5: Configuration du .env

Ajoutez ces variables dans votre fichier `.env`:

```env
# Cloudflare R2 Storage
USE_R2=true
R2_ACCOUNT_ID=votre_account_id_ici
R2_ACCESS_KEY_ID=votre_access_key_id_ici
R2_SECRET_ACCESS_KEY=votre_secret_access_key_ici
R2_BUCKET_NAME=talentsecure-videos
R2_ENDPOINT=https://votre_account_id.r2.cloudflarestorage.com

# Optional: Public URL for the bucket (si vous configurez un domaine custom)
R2_PUBLIC_URL=https://videos.votre-domaine.com
```

---

## 🌍 Étape 6: Rendre le bucket public (Optionnel)

### Option A: Avec un domaine custom (RECOMMANDÉ)

1. Dans votre bucket `talentsecure-videos`, allez dans **Settings**
2. Trouvez **Public access**
3. Cliquez sur **Connect domain**
4. Entrez votre domaine: `videos.votre-domaine.com`
5. Suivez les instructions pour ajouter le CNAME dans Cloudflare DNS
6. Une fois configuré, vos vidéos seront accessibles via:
   ```
   https://videos.votre-domaine.com/{videoKey}
   ```

### Option B: Sans domaine (URL R2 directe)

Si vous n'avez pas de domaine, on peut utiliser les signed URLs (URLs temporaires sécurisées).

---

## 🧪 Étape 7: Tester la configuration

1. Redémarrez votre serveur backend:
   ```bash
   npm run dev
   ```

2. Uploadez une vidéo test via l'interface TalentSecure

3. Vérifiez les logs du serveur:
   ```
   ✅ Uploading video to Cloudflare R2...
   ✅ Video uploaded to R2. Key: {videoKey}
   ```

4. Vérifiez dans le dashboard R2:
   - Allez dans votre bucket `talentsecure-videos`
   - Vous devriez voir le fichier vidéo

5. Testez la lecture de la vidéo dans l'application

---

## 📊 Surveiller l'utilisation

1. Dans **R2** > **Overview**, vous verrez:
   - **Storage used**: Espace utilisé sur les 10 GB
   - **Class A operations**: Writes/uploads
   - **Class B operations**: Reads/downloads

2. Limites du Free Plan:
   - 10 GB de stockage
   - 1 million Class A operations/mois
   - 10 millions Class B operations/mois
   - Bande passante: **ILLIMITÉE ET GRATUITE** 🎉

---

## 🔒 Sécurité en Production

Pour la production (Cloud Run), ajoutez les variables d'environnement:

1. Allez dans **Cloud Run** > Votre service
2. Cliquez sur **Edit & Deploy New Revision**
3. Dans **Variables & Secrets** > **Variables**, ajoutez:
   ```
   USE_R2=true
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET_NAME=talentsecure-videos
   R2_ENDPOINT=https://...
   R2_PUBLIC_URL=https://videos.votre-domaine.com (si configuré)
   ```
4. Cliquez sur **Deploy**

---

## 🆘 Dépannage

### Erreur: "Access Denied"
- Vérifiez que l'API token a les permissions **Object Read & Write**
- Vérifiez que le bucket name est correct dans `.env`

### Erreur: "Invalid endpoint"
- Vérifiez le format de l'endpoint: `https://<account-id>.r2.cloudflarestorage.com`
- Pas de slash à la fin!

### Les vidéos ne s'affichent pas
- Si vous n'avez pas configuré de domaine public, on utilise des signed URLs
- Vérifiez que `R2_PUBLIC_URL` est vide ou commenté dans `.env`

### Quota dépassé
- Vérifiez votre usage dans **R2** > **Overview**
- Nettoyez les anciennes vidéos si nécessaire

---

## 🚀 Migration depuis Google Drive

Si vous avez déjà des vidéos sur Google Drive, vous pouvez les migrer:

```bash
npm run migrate:drive-to-r2
```

Ce script:
1. Télécharge toutes les vidéos depuis Google Drive
2. Les upload vers R2
3. Met à jour la base de données

---

## 💡 Conseils

- **Organisez avec des préfixes**: Utilisez `videos/candidates/`, `videos/interviews/`, etc.
- **Nettoyez régulièrement**: Supprimez les vidéos des candidats archivés
- **Surveillez l'espace**: Activez les alertes quand vous approchez des 10 GB
- **Backup**: R2 est déjà redondant, pas besoin de backup supplémentaire

---

## ✅ Checklist Finale

- [ ] Compte Cloudflare créé
- [ ] Bucket R2 créé (`talentsecure-videos`)
- [ ] API Token créé avec permissions Read & Write
- [ ] Variables `.env` configurées
- [ ] Domaine custom configuré (optionnel)
- [ ] Test d'upload réussi
- [ ] Test de lecture réussi
- [ ] Variables production configurées (Cloud Run)
- [ ] Migration depuis Google Drive (si nécessaire)

---

**Besoin d'aide?** Consultez la [documentation officielle Cloudflare R2](https://developers.cloudflare.com/r2/)
