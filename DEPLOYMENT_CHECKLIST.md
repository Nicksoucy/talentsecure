# 🚀 Checklist de Déploiement - TalentSecure

## ✅ État Actuel du Projet

### Code Source
- ✅ Frontend: Compilé sans erreurs
- ✅ Backend: Fonctionnel en développement
- ✅ Corrections d'encodage: Complétées
- ✅ Dockerfiles: Prêts (backend et frontend)

### Base de Données
- ✅ PostgreSQL configuré (Neon DB)
- ✅ Migrations Prisma à jour
- ✅ Données de test disponibles (545 prospects, 98 candidats)

## 📋 Ce Qu'il Faut Pour Déployer en Production

### 1. Services Cloud Requis

#### Google Cloud Platform (Déjà configuré)
- ✅ Projet: `talentsecure`
- ✅ Cloud Run activé
- ✅ Cloud Build activé
- ✅ Artifact Registry activé
- ✅ GitHub connecté

#### Base de Données
- ✅ Neon DB PostgreSQL (production-ready)
- URL: `postgresql://neondb_owner:***@ep-polished-breeze-a8tnezrf-pooler.eastus2.azure.neon.tech/neondb`

#### Stockage de Fichiers (À CONFIGURER)
**Option 1: Cloudflare R2 (Recommandé - Gratuit jusqu'à 10GB)**
- [ ] Compte Cloudflare créé
- [ ] Bucket R2 créé: `talentsecure-files`
- [ ] Access Key ID généré
- [ ] Secret Access Key généré
- [ ] Public URL configuré
- 📄 Guide: `CLOUDFLARE_R2_SETUP.md`

**Option 2: Google Cloud Storage**
- [ ] Bucket GCS créé
- [ ] Service Account configuré
- [ ] Credentials JSON téléchargé

#### API OpenAI (Pour extraction de compétences)
- [ ] Compte OpenAI créé
- [ ] Clé API générée
- [ ] Crédits ajoutés (minimum $5 recommandé)
- 🔗 https://platform.openai.com/api-keys

### 2. Variables d'Environnement à Configurer

#### Backend (Cloud Run)
```env
# Application
NODE_ENV=production
PORT=8080
APP_URL=https://talentsecure-backend-XXXXX.run.app
FRONTEND_URL=https://talentsecure-frontend-XXXXX.run.app

# Database (Neon DB)
DATABASE_URL=postgresql://neondb_owner:npg_LTRz6PqlSpa5@ep-polished-breeze-a8tnezrf-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require

# JWT (GÉNÉRER DE NOUVEAUX SECRETS!)
JWT_SECRET=<générer-avec-crypto-randomBytes-32>
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=<générer-avec-crypto-randomBytes-32>
JWT_REFRESH_EXPIRES_IN=30d

# Cloudflare R2 (À CONFIGURER)
CLOUDFLARE_ACCOUNT_ID=<votre-account-id>
CLOUDFLARE_ACCESS_KEY_ID=<votre-access-key>
CLOUDFLARE_SECRET_ACCESS_KEY=<votre-secret-key>
R2_BUCKET_NAME=talentsecure-files
R2_PUBLIC_URL=https://files.votredomaine.com

# OpenAI (À CONFIGURER)
OPENAI_API_KEY=sk-proj-<votre-clé-api>

# Optional
REDIS_HOST=<si-vous-utilisez-redis>
CACHE_ENABLED=false
```

#### Frontend (Cloud Run)
```env
VITE_API_URL=https://talentsecure-backend-XXXXX.run.app
```

### 3. Commandes pour Générer les Secrets JWT

```bash
# Sur votre machine locale
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Étapes de Déploiement (Ordre Recommandé)

#### Étape 1: Configurer Cloudflare R2
1. Créer un compte Cloudflare
2. Créer un bucket R2: `talentsecure-files`
3. Générer les clés d'accès
4. Configurer le domaine public (optionnel)
5. Tester l'upload/download

#### Étape 2: Configurer OpenAI
1. Créer un compte sur https://platform.openai.com
2. Ajouter des crédits ($5-$10 recommandé)
3. Générer une clé API
4. Tester avec un appel simple

#### Étape 3: Déployer le Backend
1. Aller sur Cloud Run Console
2. Créer un service: `talentsecure-backend`
3. Configurer le déploiement continu depuis GitHub
4. Ajouter TOUTES les variables d'environnement
5. Déployer et noter l'URL

#### Étape 4: Déployer le Frontend
1. Créer un service: `talentsecure-frontend`
2. Configurer le déploiement continu depuis GitHub
3. Ajouter `VITE_API_URL` avec l'URL du backend
4. Déployer et noter l'URL

#### Étape 5: Mettre à Jour les URLs Croisées
1. Retourner au backend
2. Mettre à jour `FRONTEND_URL` avec l'URL du frontend
3. Redéployer le backend

#### Étape 6: Exécuter les Migrations
```bash
# Se connecter au backend via Cloud Run
gcloud run services exec talentsecure-backend --command="npx prisma migrate deploy"
```

#### Étape 7: Créer l'Utilisateur Admin
```bash
# Via Cloud Run
gcloud run services exec talentsecure-backend --command="npm run create-admin"
```

### 5. Tests Post-Déploiement

#### Backend Health Check
```bash
curl https://talentsecure-backend-XXXXX.run.app/health
```

Réponse attendue:
```json
{
  "status": "OK",
  "message": "TalentSecure API is running",
  "environment": "production"
}
```

#### Frontend
1. Ouvrir https://talentsecure-frontend-XXXXX.run.app
2. Tester la connexion avec admin@xguard.ca
3. Vérifier l'affichage des prospects
4. Tester l'upload d'un CV
5. Tester l'extraction de compétences

### 6. Sécurité Post-Déploiement

- [ ] Changer le mot de passe admin par défaut
- [ ] Activer HTTPS (automatique sur Cloud Run)
- [ ] Configurer les CORS correctement
- [ ] Vérifier les secrets JWT
- [ ] Activer les logs de sécurité
- [ ] Configurer les alertes de monitoring
- [ ] Limiter les accès à la base de données

### 7. Monitoring et Coûts

#### Budget Mensuel Estimé (Gratuit pour 2-5 utilisateurs)
- Cloud Run Backend: $0 (Free tier: 2M requests/mois)
- Cloud Run Frontend: $0 (Free tier)
- Neon DB: $0 (Free tier: 0.5GB)
- Cloudflare R2: $0 (Free tier: 10GB)
- OpenAI: ~$5-20/mois (selon utilisation)

**Total: ~$5-20/mois**

#### Configurer les Alertes de Budget
1. Aller sur Google Cloud Console > Billing > Budgets
2. Créer un budget de $1/mois
3. Configurer les alertes à 50%, 90%, 100%

## 📚 Documentation de Référence

- `DEPLOYMENT_GUIDE.md`: Guide détaillé de déploiement Cloud Run
- `CLOUDFLARE_R2_SETUP.md`: Configuration du stockage R2
- `CHANGELOG.md`: Historique des modifications récentes
- `README.md`: Documentation générale du projet

## 🆘 Support et Dépannage

### Problèmes Courants

**Backend ne démarre pas:**
- Vérifier `DATABASE_URL` dans les variables d'environnement
- Vérifier que `PORT=8080`
- Consulter les logs: Cloud Run > Service > LOGS

**Frontend ne charge pas:**
- Vérifier `VITE_API_URL` pointe vers le bon backend
- Vérifier les CORS dans le backend
- Ouvrir la console du navigateur (F12)

**Upload de fichiers échoue:**
- Vérifier la configuration Cloudflare R2
- Vérifier les clés d'accès
- Vérifier les permissions du bucket

**Extraction de compétences échoue:**
- Vérifier la clé OpenAI
- Vérifier les crédits OpenAI
- Consulter les logs du backend

## ✅ Checklist Finale

Avant de dire "C'est déployé!":

- [ ] Backend accessible et health check OK
- [ ] Frontend accessible et affiche la page de login
- [ ] Connexion admin fonctionne
- [ ] Liste des prospects s'affiche
- [ ] Upload de CV fonctionne
- [ ] Extraction de compétences fonctionne
- [ ] Recherche de compétences fonctionne
- [ ] Création de catalogue fonctionne
- [ ] Portail client accessible
- [ ] Tous les textes français s'affichent correctement
- [ ] Pas d'erreurs dans les logs
- [ ] Budget monitoring configuré
- [ ] Mot de passe admin changé

## 🎉 Prêt à Déployer?

Vous avez tout ce qu'il faut! Suivez le `DEPLOYMENT_GUIDE.md` étape par étape.

**Temps estimé:** 30-45 minutes pour un premier déploiement

**Prochaine étape:** Configurer Cloudflare R2 ou commencer directement le déploiement si vous avez déjà tout configuré.
