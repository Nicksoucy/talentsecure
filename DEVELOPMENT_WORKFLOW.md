# 🛠️ Workflow de Développement - TalentSecure

> **Philosophie:** Travailler en local, tester localement, puis pousser en production quand c'est stable.

---

## 📋 Table des matières

1. [Configuration initiale](#configuration-initiale)
2. [Développement local](#développement-local)
3. [Tests avant déploiement](#tests-avant-déploiement)
4. [Déploiement en production](#déploiement-en-production)
5. [Bonnes pratiques Git](#bonnes-pratiques-git)
6. [Troubleshooting](#troubleshooting)

---

## 🚀 Configuration initiale

### Prérequis

- **Node.js 20.16.0+** (IMPORTANT: Node 18 ne fonctionne plus!)
- **PostgreSQL 14+**
- **Git**
- **Docker** (optionnel, pour tests de build)
- **gcloud CLI** (pour déploiement Cloud Run)

### Vérifier votre version Node

```powershell
node --version
# Devrait afficher: v20.x.x ou v22.x.x

# Si vous avez Node 18 ou moins, mettez à jour:
# Windows: https://nodejs.org/
# avec nvm: nvm install 20 && nvm use 20
```

### Cloner et installer

```bash
# Cloner le repo
git clone https://github.com/Nicksoucy/talentsecure.git
cd talentsecure

# Backend
cd backend
npm install
cp .env.example .env
# Éditer .env avec vos valeurs locales

# Prisma
npm run prisma:generate
npm run prisma:migrate

# Frontend
cd ../frontend
npm install
cp .env.example .env
# Éditer .env avec l'URL backend locale
```

---

## 💻 Développement local

### 1. Démarrer le Backend (Terminal 1)

```bash
cd backend
npm run dev
```

**Ce qui se passe:**
- ✅ TypeScript compile à la volée
- ✅ Redémarre automatiquement sur changements
- ✅ Logs en temps réel
- ✅ Écoute sur `http://localhost:5000`

**Vérifier que ça marche:**
```bash
curl http://localhost:5000/health
# Devrait retourner: {"status":"OK",...}
```

### 2. Démarrer le Frontend (Terminal 2)

```bash
cd frontend
npm run dev
```

**Ce qui se passe:**
- ✅ Vite dev server avec HMR
- ✅ Rafraîchissement instantané
- ✅ Accessible sur `http://localhost:5173`

### 3. Travailler sur une feature

```bash
# 1. Créer une branche pour votre feature
git checkout -b feature/ma-nouvelle-feature

# 2. Coder...
# ... faire vos modifications ...

# 3. Tester en local (voir section Tests)

# 4. Commit régulièrement
git add .
git commit -m "feat: ajout de ma feature"

# 5. NE PAS POUSSER tant que ce n'est pas testé!
```

---

## 🧪 Tests avant déploiement

### ✅ Checklist complète avant de push

#### Backend

```bash
cd backend

# 1. Vérifier que TypeScript compile sans erreurs
npm run build

# ✅ Vous devriez voir: "Build completed successfully"
# ❌ Si erreurs: corrigez-les avant de continuer!

# 2. Vérifier les tests (si vous en avez)
npm test

# 3. Linter le code
npm run lint  # Si configuré
```

#### Frontend

```bash
cd frontend

# 1. Build de production
npm run build

# ✅ Devrait compiler sans erreurs
# ❌ Si erreurs TypeScript/Vite: corrigez!

# 2. Preview du build
npm run preview

# Ouvrir http://localhost:4173 et tester manuellement
```

#### Test Docker local (optionnel mais recommandé)

```bash
cd backend

# Build l'image comme en production
docker build -t talentsecure-backend-test:latest .

# ✅ Si le build passe, ça passera aussi sur Cloud Run!
# ❌ Si échec: fix les erreurs TypeScript

# Tester l'image localement
docker run -p 8080:8080 \
  -e DATABASE_URL="your-db-url" \
  -e JWT_SECRET="test-secret" \
  talentsecure-backend-test:latest

# Vérifier: curl http://localhost:8080/health
```

---

## 🚢 Déploiement en production

### Option A: Push automatique (via Cloud Build Trigger)

```bash
# 1. Vérifier que tout est committé
git status

# 2. Push sur main
git push origin main

# 3. Cloud Build se déclenche automatiquement!
# Surveiller: https://console.cloud.google.com/cloud-build/builds?project=talentsecure
```

**Trigger configurés:**
- `rmgpgab-talentsecure-northamerica-northeast1-Nicksoucy-talenjfd` → Backend
- `rmgpgab-talentsecure-frontend-northamerica-northeast1-Nicksoiis` → Frontend

**Ce qui se passe:**
1. Cloud Build clone votre repo
2. Build l'image Docker avec Node 20
3. Compile TypeScript
4. Push l'image vers Artifact Registry
5. Déploie sur Cloud Run
6. **~3-4 minutes total**

### Option B: Déploiement manuel

Si Cloud Build est en panne et que tu dois forcer un déploiement, lance le build via gcloud :

```bash
# Submit un build à partir du yaml de prod
gcloud builds submit \
  --config=cloudbuild-backend.yaml \
  --region=northamerica-northeast1 \
  .

# Ou pour le frontend
gcloud builds submit \
  --config=cloudbuild-frontend.yaml \
  --region=northamerica-northeast1 \
  .
```

### Vérifier le déploiement

```bash
# Backend
curl https://talentsecure-572017163659.northamerica-northeast1.run.app/health

# Frontend
# Ouvrir dans le navigateur:
https://talentsecure-frontend-572017163659.northamerica-northeast1.run.app
```

---

## 🌳 Bonnes pratiques Git

### Workflow recommandé

```bash
# 1. Toujours partir de main à jour
git checkout main
git pull origin main

# 2. Créer une branche feature
git checkout -b feature/nom-descriptif

# 3. Travailler + commit régulièrement
git add .
git commit -m "feat: description claire"

# 4. Tester localement (voir section Tests)
npm run build  # Backend ET Frontend!

# 5. Merger dans main quand c'est stable
git checkout main
git merge feature/nom-descriptif

# 6. Push (déclenche le déploiement automatique)
git push origin main

# 7. Surveiller le build
# https://console.cloud.google.com/cloud-build/builds?project=talentsecure
```

### Conventions de commit

```bash
# Nouvelles features
git commit -m "feat: ajout de la recherche par ville"

# Corrections de bugs
git commit -m "fix: correction du filtre de candidats"

# Améliorations de performance
git commit -m "perf: optimisation des queries Prisma"

# Documentation
git commit -m "docs: mise à jour du README"

# Refactoring
git commit -m "refactor: simplification du controller admin"

# Style/formatting
git commit -m "style: formatage du code avec prettier"

# Tests
git commit -m "test: ajout des tests pour l'API candidates"

# Build/CI
git commit -m "chore: mise à jour des dépendances"
```

### Que faire si vous avez oublié de tester avant de push?

```bash
# Si le build échoue sur Cloud Run:

# 1. Ne pas paniquer! Votre ancienne version est toujours en ligne

# 2. Corriger localement
npm run build  # Identifier les erreurs
# ... corriger ...

# 3. Tester à nouveau
npm run build  # Doit passer!

# 4. Commit et push le fix
git add .
git commit -m "fix: correction des erreurs TypeScript"
git push origin main

# 5. Le nouveau build devrait réussir
```

---

## 🔧 Troubleshooting

### "Module not found" ou dépendances manquantes

```bash
# Backend
cd backend
rm -rf node_modules package-lock.json
npm install

# Frontend
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### TypeScript compile en local mais échoue sur Cloud Run

**Cause:** Vous avez probablement:
- Oublié de commit un fichier
- Utilisé un chemin absolu Windows
- Importé quelque chose qui n'existe que localement

**Solution:**
```bash
# Vérifier que tout est committé
git status

# Tester le build comme sur Cloud Run
cd backend
rm -rf dist node_modules
npm ci  # Installe exactement ce qui est dans package-lock.json
npm run build

# Si ça échoue ici, corrigez avant de push!
```

### "EBADENGINE Unsupported engine" warnings

**Cause:** Vous avez Node 18 ou moins

**Solution:**
```bash
# Mettez à jour vers Node 20+
node --version  # Vérifier

# Puis rebuild
npm install
```

### Port déjà utilisé (EADDRINUSE)

```bash
# Windows - Trouver qui utilise le port 5000
netstat -ano | findstr :5000

# Tuer le process
taskkill /PID <PID> /F

# Ou changer le port dans backend/.env
PORT=5001
```

### Base de données: "Connection refused"

```bash
# Vérifier que PostgreSQL tourne
# Windows: Services → PostgreSQL

# Vérifier la connection string dans backend/.env
DATABASE_URL="postgresql://user:password@localhost:5432/talentsecure?schema=public"

# Tester la connexion
psql -U your-user -d talentsecure
```

### Cloud Run: "Container failed to start"

**Causes communes:**
1. ❌ Erreurs TypeScript (le build Docker passe mais le code est cassé)
2. ❌ DATABASE_URL manquant ou invalide
3. ❌ Import de module incorrect
4. ❌ Port mal configuré

**Debugging:**
```bash
# 1. Voir les logs Cloud Run
https://console.cloud.google.com/logs/query?project=talentsecure

# 2. Filtrer par:
resource.type="cloud_run_revision"
resource.labels.service_name="talentsecure"

# 3. Chercher:
- "Error:" ou "TypeError:"
- "Cannot find module"
- "Connection refused"
```

**Solution:**
```bash
# Tester le build Docker localement
cd backend
docker build -t test .

# Si ça échoue, corrigez les erreurs TypeScript
# Si ça passe, vérifiez les variables d'environnement Cloud Run
```

---

## 🎯 Résumé rapide

### Workflow quotidien idéal

```bash
# Matin
git checkout main
git pull origin main
git checkout -b feature/ma-feature

# Pendant la journée
# ... coder ...
npm run dev  # Tester en temps réel
git commit -m "feat: work in progress"  # Commits locaux

# Avant de partir
npm run build  # Backend ET frontend
# ✅ Si ça passe:
git push origin main

# ❌ Si ça échoue:
# Corriger et re-tester jusqu'à ce que ça passe
```

### Commandes essentielles

```bash
# Développement local
npm run dev           # Démarrer en mode dev
npm run build         # Compiler TypeScript
npm test              # Lancer les tests

# Git
git status            # Voir les changements
git add .             # Ajouter tous les fichiers
git commit -m "..."   # Commit avec message
git push origin main  # Déployer (après avoir testé!)

# Vérifier la prod
curl https://talentsecure-572017163659.northamerica-northeast1.run.app/health
```

---

## 📚 Ressources

- **Documentation Prisma:** https://www.prisma.io/docs
- **TypeScript Handbook:** https://www.typescriptlang.org/docs/
- **Cloud Run Docs:** https://cloud.google.com/run/docs
- **Git Workflow:** https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow

---

**Happy coding! 🚀**

Si vous avez des questions, consultez ce guide ou les logs d'erreur.
