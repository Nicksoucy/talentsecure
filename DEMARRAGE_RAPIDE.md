# 🚀 DÉMARRAGE RAPIDE - TalentSecure

Guide pour démarrer l'application en local en 10 minutes !

---

## ✅ Prérequis

Avant de commencer, vérifiez que vous avez :

- [x] **Node.js 18+** installé → Vérifier: `node --version`
- [x] **npm** installé → Vérifier: `npm --version`
- [x] **PostgreSQL** installé (ou utilisez une DB en ligne)

---

## 📋 ÉTAPES À SUIVRE

### ÉTAPE 1 : Installer les dépendances

Ouvrez **2 terminaux** ou **2 onglets PowerShell/CMD** :

#### Terminal 1 - Backend
```bash
cd C:\Recrutement\talentsecure\backend
npm install
```

**Attendez que l'installation se termine (~2-3 minutes)**

#### Terminal 2 - Frontend
```bash
cd C:\Recrutement\talentsecure\frontend
npm install
```

**Attendez que l'installation se termine (~2-3 minutes)**

---

### ÉTAPE 2 : Configurer la base de données

#### Option A : PostgreSQL Local (RECOMMANDÉ pour débuter)

1. **Si PostgreSQL n'est pas installé** :
   - Téléchargez depuis : https://www.postgresql.org/download/windows/
   - Installez avec les options par défaut
   - Retenez le mot de passe que vous définissez !

2. **Créer la base de données** :
   ```bash
   # Ouvrir psql (cherchez "psql" dans le menu Windows)
   # Ou via ligne de commande :
   psql -U postgres

   # Dans psql, tapez :
   CREATE DATABASE talentsecure;
   \q
   ```

#### Option B : Utiliser une DB temporaire (pour tester rapidement)

Utilisez une DB en ligne gratuite comme **Neon** ou **Supabase** :
- Neon : https://neon.tech (PostgreSQL gratuit)
- Supabase : https://supabase.com (PostgreSQL gratuit)

Récupérez l'URL de connexion (ressemble à : `postgresql://user:pass@host:5432/dbname`)

---

### ÉTAPE 3 : Configurer les variables d'environnement

#### Backend

1. **Créer le fichier `.env`** dans `backend\` :
   ```bash
   cd C:\Recrutement\talentsecure\backend
   copy .env.example .env
   ```

2. **Éditer `backend\.env`** avec un éditeur de texte :
   ```env
   # Application
   NODE_ENV=development
   PORT=5000
   FRONTEND_URL=http://localhost:5173

   # Database (MODIFIER ICI !)
   DATABASE_URL="postgresql://postgres:VOTRE_MOT_DE_PASSE@localhost:5432/talentsecure?schema=public"

   # JWT Secrets (MODIFIER ICI !)
   JWT_SECRET="mon-secret-super-securise-123-changez-moi"
   JWT_REFRESH_SECRET="mon-refresh-secret-456-changez-moi-aussi"

   # Google OAuth (OPTIONNEL - peut être vide pour l'instant)
   GOOGLE_CLIENT_ID=""
   GOOGLE_CLIENT_SECRET=""
   GOOGLE_CALLBACK_URL="http://localhost:5000/api/auth/google/callback"

   # Google Cloud Storage (OPTIONNEL pour l'instant)
   GCS_PROJECT_ID=""
   GCS_BUCKET_NAME=""

   # Redis (OPTIONNEL pour l'instant)
   REDIS_HOST=localhost
   REDIS_PORT=6379
   ```

   **⚠️ IMPORTANT :**
   - Remplacez `VOTRE_MOT_DE_PASSE` par votre mot de passe PostgreSQL
   - Changez les `JWT_SECRET` par des valeurs aléatoires longues
   - Les valeurs Google OAuth et GCS peuvent rester vides pour l'instant

#### Frontend

1. **Créer le fichier `.env`** dans `frontend\` :
   ```bash
   cd C:\Recrutement\talentsecure\frontend
   copy .env.example .env
   ```

2. **Éditer `frontend\.env`** :
   ```env
   VITE_API_URL=http://localhost:5000
   VITE_APP_NAME=TalentSecure
   VITE_APP_VERSION=1.0.0
   ```

   **Normalement, aucune modification nécessaire !**

---

### ÉTAPE 4 : Initialiser la base de données

Dans le **Terminal 1 (Backend)** :

```bash
cd C:\Recrutement\talentsecure\backend

# Générer le client Prisma
npm run prisma:generate

# Créer les tables dans la base de données
npm run prisma:migrate
```

**Vous devriez voir :**
```
✔ Generated Prisma Client
✔ Applied migration(s)
```

---

### ÉTAPE 5 : Démarrer le Backend

Dans le **Terminal 1** :

```bash
cd C:\Recrutement\talentsecure\backend
npm run dev
```

**✅ Vous devriez voir :**
```
🚀 TalentSecure API démarrée sur http://localhost:5000
📊 Environnement: development
🔒 CORS activé pour: http://localhost:5173
```

**✅ Testez le backend :**
Ouvrez votre navigateur : http://localhost:5000/health

Vous devriez voir :
```json
{
  "status": "OK",
  "message": "TalentSecure API is running",
  "timestamp": "2025-11-04T...",
  "environment": "development"
}
```

**⚠️ LAISSEZ CE TERMINAL OUVERT !**

---

### ÉTAPE 6 : Démarrer le Frontend

Dans le **Terminal 2** :

```bash
cd C:\Recrutement\talentsecure\frontend
npm run dev
```

**✅ Vous devriez voir :**
```
VITE v5.0.11  ready in 500 ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
➜  press h to show help
```

**⚠️ LAISSEZ CE TERMINAL OUVERT AUSSI !**

---

### ÉTAPE 7 : Créer un utilisateur Admin

Vous avez **2 options** :

#### Option A : Via l'API (avec un outil comme Postman, Insomnia, ou curl)

**Avec curl (dans un nouveau terminal) :**
```bash
curl -X POST http://localhost:5000/api/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@xguard.com\",\"password\":\"Admin123!\",\"firstName\":\"Admin\",\"lastName\":\"XGUARD\",\"role\":\"ADMIN\"}"
```

**Avec Postman/Insomnia :**
- Méthode : `POST`
- URL : `http://localhost:5000/api/auth/register`
- Headers : `Content-Type: application/json`
- Body (JSON) :
  ```json
  {
    "email": "admin@xguard.com",
    "password": "Admin123!",
    "firstName": "Admin",
    "lastName": "XGUARD",
    "role": "ADMIN"
  }
  ```

#### Option B : Via Prisma Studio (Interface graphique)

```bash
# Dans le Terminal 1 (Backend), ouvrez un nouvel onglet :
cd C:\Recrutement\talentsecure\backend
npm run prisma:studio
```

Cela ouvre automatiquement votre navigateur sur http://localhost:5555

1. Cliquez sur **"User"** dans la sidebar
2. Cliquez sur **"Add record"**
3. Remplissez :
   - **email** : `admin@xguard.com`
   - **password** : (laissez vide pour l'instant, on va le hasher)
   - **firstName** : `Admin`
   - **lastName** : `XGUARD`
   - **role** : `ADMIN`
   - **isActive** : `true`
4. **Save 1 change**

**⚠️ Note :** Le mot de passe doit être hashé. Utilisez plutôt l'Option A avec l'API !

---

### ÉTAPE 8 : Se connecter à l'application

1. **Ouvrez votre navigateur** : http://localhost:5173

2. **Vous devriez voir la page de login TalentSecure** 🎉

3. **Connectez-vous avec :**
   - **Email** : `admin@xguard.com`
   - **Mot de passe** : `Admin123!`

4. **Cliquez sur "Se connecter"**

5. **Vous serez redirigé vers le Dashboard !** 🚀

---

## 🎉 FÉLICITATIONS !

Vous avez maintenant TalentSecure qui tourne en local !

### Ce que vous pouvez faire maintenant :

- ✅ Explorer le **Dashboard** avec les statistiques
- ✅ Naviguer dans le menu (Candidats, Catalogues, etc.)
- ✅ Tester le **logout** et **re-login**
- ✅ Voir votre profil (clic sur l'avatar en haut à droite)

---

## 🐛 Problèmes courants et solutions

### Problème 1 : `npm install` échoue

**Solution :**
```bash
# Nettoyer le cache npm
npm cache clean --force

# Supprimer node_modules et réinstaller
rmdir /s /q node_modules
npm install
```

---

### Problème 2 : "Cannot connect to database"

**Solutions :**

1. **Vérifier que PostgreSQL est démarré**
   - Cherchez "Services" dans Windows
   - Trouvez "PostgreSQL" et vérifiez qu'il est "Running"

2. **Vérifier l'URL dans `.env`**
   ```env
   # Format correct :
   DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE"

   # Exemple :
   DATABASE_URL="postgresql://postgres:monpassword@localhost:5432/talentsecure"
   ```

3. **Tester la connexion manuellement**
   ```bash
   psql -U postgres -d talentsecure
   # Si ça fonctionne, votre DB est OK !
   ```

---

### Problème 3 : Port 5000 déjà utilisé

**Solution :**

Changez le port dans `backend\.env` :
```env
PORT=5001
```

Et redémarrez le backend.

---

### Problème 4 : "Prisma Client could not be generated"

**Solution :**
```bash
cd backend
npx prisma generate
npx prisma migrate dev
```

---

### Problème 5 : Frontend affiche "Cannot connect to API"

**Solutions :**

1. **Vérifier que le backend tourne**
   - Ouvrir http://localhost:5000/health
   - Devrait retourner `{"status":"OK"}`

2. **Vérifier le `.env` du frontend**
   ```env
   VITE_API_URL=http://localhost:5000
   ```

3. **Redémarrer le frontend**
   - `Ctrl+C` dans le terminal
   - `npm run dev`

---

### Problème 6 : "Invalid credentials" lors du login

**Solutions :**

1. **Vérifier que l'utilisateur existe**
   ```bash
   npm run prisma:studio
   # Aller dans Users, vérifier que admin@xguard.com existe
   ```

2. **Recréer l'utilisateur via l'API**
   (Voir ÉTAPE 7 Option A)

---

## 📱 Accès rapides

Pendant le développement, gardez ces onglets ouverts :

- **Frontend** : http://localhost:5173
- **Backend Health** : http://localhost:5000/health
- **Prisma Studio** : http://localhost:5555 (après `npm run prisma:studio`)
- **Backend API Docs** : http://localhost:5000/api (à venir)

---

## 🛑 Arrêter l'application

Dans chaque terminal :
- Appuyez sur `Ctrl+C`
- Tapez `Y` si demandé

---

## 🔄 Redémarrer l'application

**Terminal 1 - Backend :**
```bash
cd C:\Recrutement\talentsecure\backend
npm run dev
```

**Terminal 2 - Frontend :**
```bash
cd C:\Recrutement\talentsecure\frontend
npm run dev
```

---

## 📞 Besoin d'aide ?

Si vous rencontrez un problème :

1. Lisez les messages d'erreur dans les terminaux
2. Consultez la section "Problèmes courants" ci-dessus
3. Vérifiez les fichiers `.env`
4. Redémarrez tout (backend + frontend)

---

## 🎯 Prochaines étapes

Une fois que tout fonctionne :

1. **Explorez l'interface** - Familiarisez-vous avec le dashboard
2. **Consultez le code** - Regardez les fichiers créés
3. **Semaine 3-4** - Commencez le développement du CRUD Candidats !

---

**Bon développement ! 🚀**
